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

  const start = now.clone().startOf('day').utc().toDate();
  const end = now.clone().endOf('day').utc().toDate();

  const events = await EventInstance.find({
    church: user.church,
    date: { $gte: start, $lte: end }
  }).lean();

  return events.find(e => {
    if (e.isCheckinOpen) {return true;}
    const d = moment(e.date).format('YYYY-MM-DD');
    const s = moment.tz(`${d} ${e.startTime}`, 'YYYY-MM-DD HH:mm', tz);
    const en = moment.tz(`${d} ${e.endTime}`, 'YYYY-MM-DD HH:mm', tz);
    return now.isBetween(s.clone().subtract(2, 'hours'), en);
  }) || null;
}

module.exports = { getActiveEventForUser };

