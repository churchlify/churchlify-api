const Church = require('../models/church');
const user = require('../models/user');
const Event = require('../models/event');
const EventInstance = require('../models/eventinstance');

class EventService {

getInstanceDateKey(date) {
  return new Date(date).toISOString();
}

async buildRecurringInstances(event) {
  // Use UTC date calculations (no timezone conversion needed)
  const now = new Date();
  const futureLimit = new Date(now);
  futureLimit.setUTCDate(futureLimit.getUTCDate() + 365);

  const { recurrence, startDate, startTime, endTime } = event;
  let occurrences = [];
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
    existingInstances.map((instance) => [this.getInstanceDateKey(instance.date), !!instance.isCheckinOpen])
  );

  return occurrences.map((date) => ({
    eventId: event._id,
    church: event.church,
    title: event.title,
    description: event.description,
    location: event.location,
    flier: event.flier,
    date,
    startTime,
    endTime,
    isCheckinOpen: checkinByDate.get(this.getInstanceDateKey(date)) || false
  }));
}

async syncEventInstancesForEvent(eventOrId) {
  const isEventId = typeof eventOrId === 'string' || eventOrId?.constructor?.name === 'ObjectId';
  let event = eventOrId;

  if (isEventId) {
    event = await Event.findById(eventOrId).populate('church');
  }

  if (!event) {
    throw new Error('Event not found while syncing event instances.');
  }

  if (event.isRecurring) {
    const instances = await this.buildRecurringInstances(event);
    await EventInstance.deleteMany({ eventId: event._id });
    if (instances.length > 0) {
      await EventInstance.insertMany(instances);
    }
    return;
  }

  const existingInstance = await EventInstance.findOne({ eventId: event._id })
    .select('isCheckinOpen')
    .lean();

  await EventInstance.deleteMany({ eventId: event._id });
  await EventInstance.create({
    eventId: event._id,
    church: event.church,
    title: event.title,
    description: event.description,
    location: event.location,
    flier: event.flier,
    date: event.startDate,
    startTime: event.startTime,
    endTime: event.endTime,
    isCheckinOpen: !!existingInstance?.isCheckinOpen
  });
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

  return start.toDate(); // fallback if no match (shouldn't happen)
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