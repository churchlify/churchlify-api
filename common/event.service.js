const Church = require('../models/church');
const user = require('../models/user');
const Event = require('../models/event');
const EventInstance = require('../models/eventinstance');
const moment = require('moment-timezone');

class EventService {

 normalizeDate(inputDate, churchTimezone) {
  return moment
    .tz(inputDate, churchTimezone)   // interpret the date in the church's timezone
    .startOf('day')                  // snap to local midnight
    .utc()                           // convert to UTC
    .toDate();                       // store as a stable UTC date
}

 normalizeTime(inputTime, format = 'HH:mm') {
  return moment(inputTime, format).format('HH:mm');
 }

getInstanceDateKey(date) {
   return moment.utc(date).format('YYYY-MM-DD');
}

async buildRecurringInstances(event) {
  const now = new Date();
  const futureLimit = new Date(now);
  futureLimit.setUTCDate(futureLimit.getUTCDate() + 365);

  const { recurrence, startDate, startTime, endTime } = event;
  const occurrences = [];
  let current = this.getFirstMatchingWeekday(startDate, recurrence.daysOfWeek || []);

  while (current <= futureLimit && (!recurrence.endDate || current <= recurrence.endDate)) {
    const weekday = current.getUTCDay();

    if (recurrence.frequency === 'DAILY') {
      occurrences.push(new Date(current));
      current = this.addDaysUTC(current, recurrence.interval);
    } else if (recurrence.frequency === 'WEEKLY' && recurrence.daysOfWeek.includes(weekday)) {
      occurrences.push(new Date(current));
      current = this.addDaysUTC(current, recurrence.interval * 7);
    } else if (recurrence.frequency === 'MONTHLY') {
      occurrences.push(new Date(current));
      current = this.addMonthsUTC(current, recurrence.interval);
    } else if (recurrence.frequency === 'YEARLY') {
      occurrences.push(new Date(current));
      current = this.addYearsUTC(current, recurrence.interval);
    } else {
      current = this.addDaysUTC(current, 1);
    }
  }

  const existingInstances = await EventInstance.find({ eventId: event._id })
    .select('date isCheckinOpen')
    .lean();

  const checkinByDate = new Map(
    existingInstances.map((instance) => [
      this.getInstanceDateKey(instance.date),
      !!instance.isCheckinOpen
    ])
  );

  return occurrences.map((date) => {
    const key = this.getInstanceDateKey(date);
    return {
      eventId: event._id,
      church: event.church,
      title: event.title,
      description: event.description,
      location: event.location,
      flier: event.flier,
      date, // already UTC date
      startTime,
      endTime,
      isCheckinOpen: checkinByDate.get(key) || false
    };
  });
}

async syncEventInstancesForEvent(eventOrId) {
  const isEventId = typeof eventOrId === 'string' || eventOrId?.constructor?.name === 'ObjectId';
  let event = eventOrId;

  if (isEventId) {
    event = await Event.findById(eventOrId).populate('church');
  }
  if (!event) throw new Error('Event not found while syncing event instances.');

  if (event.isRecurring) {
    return this.syncRecurringInstances(event);
  }

  // single instance: update or create, but don't delete
  await EventInstance.findOneAndUpdate(
    { eventId: event._id },
    {
      eventId: event._id,
      church: event.church,
      title: event.title,
      description: event.description,
      location: event.location,
      flier: event.flier,
      date: event.startDate,
      startTime: event.startTime,
      endTime: event.endTime
    },
    { upsert: true }
  );
}

async syncRecurringInstances(event) {
  const instances = await this.buildRecurringInstances(event);

  const existing = await EventInstance.find({ eventId: event._id }).lean();
  const existingByKey = new Map(
    existing.map(i => [this.getInstanceDateKey(i.date), i])
  );

  const toInsert = [];
  const seenKeys = new Set();

  for (const inst of instances) {
    const key = this.getInstanceDateKey(inst.date);
    seenKeys.add(key);

    if (existingByKey.has(key)) {
      const existingInst = existingByKey.get(key);
      await EventInstance.updateOne(
        { _id: existingInst._id },
        {
          title: inst.title,
          description: inst.description,
          location: inst.location,
          flier: inst.flier,
          startTime: inst.startTime,
          endTime: inst.endTime,
          // preserve isCheckinOpen from existing
          isCheckinOpen: existingInst.isCheckinOpen
        }
      );
    } else {
      toInsert.push(inst);
    }
  }

  if (toInsert.length) {
    await EventInstance.insertMany(toInsert);
  }

  // delete only obsolete future instances (optional: keep past ones)
  const obsolete = existing.filter(i => !seenKeys.has(this.getInstanceDateKey(i.date)));
  if (obsolete.length) {
    await EventInstance.deleteMany({ _id: { $in: obsolete.map(o => o._id) } });
  }
}


flattenObject(obj, prefix = '', result = {}) {
  for (const key in obj) {
    const value = obj[key];
    const path = prefix ? `${prefix}.${key}` : key;

    if (Array.isArray(value)) {
      result[path] = value; // ✅ preserve arrays
    } else if (value !== null && typeof value === 'object') {
      this.flattenObject(value, path, result); // recurse
    } else {
      result[path] = value;
    }
  }
  return result;
}

getFirstMatchingWeekday(startDate, daysOfWeek) {
  const start = new Date(startDate);
  const maxLookahead = 7;

  for (let i = 0; i < maxLookahead; i++) {
    const candidate = new Date(start);
    candidate.setUTCDate(candidate.getUTCDate() + i);
    const candidateDayOfWeek = candidate.getUTCDay();
    if (daysOfWeek.includes(candidateDayOfWeek)) {
      return candidate;
    }
  }

  return start; // fallback
}

addDaysUTC(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

addMonthsUTC(date, months) {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

addYearsUTC(date, years) {
  const result = new Date(date);
  result.setUTCFullYear(result.getUTCFullYear() + years);
  return result;
}

async expandRecurringEvents() {

  const events = await Event.find({ isRecurring: true }).populate('church');

  for (const event of events) {
    await this.syncEventInstancesForEvent(event);
  }
}

  // Create a new event (recurring or single)
  async createEvent(eventData) {
   const  event = await Event.create(eventData);
   console.log('Created Event:', event);
    if (event.isRecurring) {
       await this.syncEventInstancesForEvent(event); // cache future instances
         return event; // Return the base event object for recurring events
      } else {
          // Insert one instance directly
          return await EventInstance.create({
            eventId: event._id,
            church: event.church,
            title: event.title,
            description: event.description,
            location: event.location,
            date: event.startDate,
            startTime: event.startTime,
            endTime: event.endTime
          });
    }
  }

  // PRE-CREATED METHODS
  async checkChurchById (id){ return await Church.findById(id);}
  async checkUserById (id){ return await user.findById(id);}

 parseDateTime (dateString, timeString) {
  const date = new Date(dateString); // Parse the date string into a Date object
  const [hours, minutes] = timeString.split(':').map(Number); // Split the time string into hours and minutes
  date.setUTCHours(hours, minutes); // Set the hours and minutes on the date object
  return date;
  }

}

module.exports = new EventService();