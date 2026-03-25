// services/event.service.js
const moment = require('moment-timezone');
const EventInstance = require('../models/eventinstance');
const Church = require('../models/church');

async function getActiveEventForUser(user, preferredEventId = null) {
  const church = await Church.findById(user.church).select('timeZone').lean();
  const tz = church?.timeZone || 'UTC';
  const now = moment.tz(tz);

  if (preferredEventId) {
    const event = await EventInstance.findOne({ _id: preferredEventId, church: user.church }).lean();
    if (event) return event;
  }

  // Today in church timezone, as a calendar date string
  const todayStr = now.format('YYYY-MM-DD');

  // Build UTC range for that calendar date (since date is stored as YYYY-MM-DDT00:00Z)
  const start = moment.utc(todayStr, 'YYYY-MM-DD').startOf('day').toDate(); // 2026-03-25T00:00Z
  const end = moment.utc(todayStr, 'YYYY-MM-DD').endOf('day').toDate();     // 2026-03-25T23:59:59Z

  const events = await EventInstance.find({
    church: user.church,
    date: { $gte: start, $lte: end }
  }).lean();

  console.log("Today's events:", events);

  return (
    events.find(e => {
      if (e.isCheckinOpen) return true;

      const d = new Date(e.date).toISOString().split('T')[0]; // "2026-03-25"
      const s = moment.tz(`${d} ${e.startTime}`, 'YYYY-MM-DD HH:mm', tz);
      const en = moment.tz(`${d} ${e.endTime}`, 'YYYY-MM-DD HH:mm', tz);

      return now.isBetween(s.clone().subtract(2, 'hours'), en);
    }) || null
  );
}


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

module.exports = { getActiveEventForUser, getChurchActiveEvent };
