// services/event.service.js
const moment = require('moment-timezone');
const EventInstance = require('../models/eventinstance');
const Church = require('../models/church');

async function getChurchActiveEvent(user, preferredEventId = null) {
  const church = await Church.findById(user.church).select('timeZone').lean();
  const churchTimezone = church?.timeZone || 'UTC';
  const nowInChurchTz = moment.tz(churchTimezone);

  console.log('Current time in church timezone:', nowInChurchTz.format(), 'Preferred event ID:', preferredEventId);

  if (preferredEventId) {
    const event = await EventInstance.findOne({ _id: preferredEventId, church: user.church }).lean();
    if (event) return event;
  }

  // FIX: Query by calendar date, not timezone-shifted UTC window
  const todayStr = nowInChurchTz.format('YYYY-MM-DD');
  const startOfDay = moment.utc(todayStr, 'YYYY-MM-DD').startOf('day').toDate();
  const endOfDay = moment.utc(todayStr, 'YYYY-MM-DD').endOf('day').toDate();

  console.log('Looking for events between:', startOfDay, 'and', endOfDay, 'for church:', user.church);

  const todayInstances = await EventInstance.find({
    church: user.church,
    date: { $gte: startOfDay, $lte: endOfDay }
  }).lean();

  console.log("Today's event instances:", todayInstances);

  return todayInstances.find(instance => {
    if (instance.isCheckinOpen) return true;

    // This part is correct given your clarified model
    const literalDate = moment(instance.date).format('YYYY-MM-DD');
    const eventStart = moment.tz(`${literalDate} ${instance.startTime}`, 'YYYY-MM-DD HH:mm', churchTimezone);
    const eventEnd = moment.tz(`${literalDate} ${instance.endTime}`, 'YYYY-MM-DD HH:mm', churchTimezone);

    return nowInChurchTz.isBetween(eventStart.clone().subtract(2, 'hours'), eventEnd);
  });
}

async function getChurchUpcomingEvent(user, preferredEventId = null) {
  const church = await Church.findById(user.church).select('timeZone').lean();
  const tz = church?.timeZone || 'UTC';
  const now = moment.tz(tz);

  if (preferredEventId) {
    const event = await EventInstance.findOne({ _id: preferredEventId, church: user.church }).lean();
    if (event) return event;
  }

  // Query by calendar date (correct)
  const todayStr = now.format('YYYY-MM-DD');
  const startOfDay = moment.utc(todayStr).startOf('day').toDate();
  const endOfDay = moment.utc(todayStr).endOf('day').toDate();

  console.log('Looking for upcoming events between:', startOfDay, 'and', endOfDay, 'for church:', user.church);
  const events = await EventInstance.find({
    church: user.church,
    date: { $gte: startOfDay, $lte: endOfDay }
  }).lean();

  if (!events.length) return null;

  // Filter to events starting within next 2 hours and not ended
  const upcoming = events
    .map(e => {
      const d = moment(e.date).format('YYYY-MM-DD');
      const start = moment.tz(`${d} ${e.startTime}`, 'YYYY-MM-DD HH:mm', tz);
      const end = moment.tz(`${d} ${e.endTime}`, 'YYYY-MM-DD HH:mm', tz);
      return { ...e, start, end };
    })
    .filter(e =>
      now.isBefore(e.end) &&                     // event not ended
      now.isSameOrAfter(e.start.clone().subtract(2, 'hours')) // within 2h before start
    );
    console.log('Upcoming events within 2 hours:', upcoming);
  if (!upcoming.length) return null;

  // Pick the earliest starting event
  upcoming.sort((a, b) => a.start - b.start);

  return upcoming[0];
}


module.exports = { getChurchUpcomingEvent, getChurchActiveEvent };
