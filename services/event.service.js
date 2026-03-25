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
    if (event) {return event;}
  }

  const start = now.clone().startOf('day').toDate();
  const end = now.clone().endOf('day').toDate();

  const events = await EventInstance.find({
    church: user.church,
    date: { $gte: start, $lte: end }
  }).lean();

  return events.find(e => {
    if (e.isCheckinOpen) {return true;}
    const d = new Date(e.date).toISOString().split('T')[0];
    const s = moment.tz(`${d} ${e.startTime}`, 'YYYY-MM-DD HH:mm', tz);
    const en = moment.tz(`${d} ${e.endTime}`, 'YYYY-MM-DD HH:mm', tz);
    return now.isBetween(s.clone().subtract(2, 'hours'), en);
  }) || null;
}

async function getChurchActiveEvent(churchId, preferredEventId = null) {
  const church = await Church.findById(churchId).select('timeZone').lean();
  const churchTimezone = church?.timeZone || 'UTC';
  const nowInChurchTz = moment.tz(churchTimezone);

  if (preferredEventId) {
    const event = await EventInstance.findOne({ _id: preferredEventId, church: churchId }).lean();
    if (event) return event;
  }

  const startOfDay = nowInChurchTz.clone().startOf('day').toDate();
  const endOfDay = nowInChurchTz.clone().endOf('day').toDate();

  const todayInstances = await EventInstance.find({
    church: churchId,
    date: { $gte: startOfDay, $lte: endOfDay }
  }).lean();

  return todayInstances.find(instance => {
    if (instance.isCheckinOpen) return true;
    
    const literalDate = new Date(instance.date).toISOString().split('T')[0];
    const eventStart = moment.tz(`${literalDate} ${instance.startTime}`, 'YYYY-MM-DD HH:mm', churchTimezone);
    const eventEnd = moment.tz(`${literalDate} ${instance.endTime}`, 'YYYY-MM-DD HH:mm', churchTimezone);
    
    return nowInChurchTz.isBetween(eventStart.clone().subtract(2, 'hours'), eventEnd);
  });
}

module.exports = { getActiveEventForUser, getChurchActiveEvent };
