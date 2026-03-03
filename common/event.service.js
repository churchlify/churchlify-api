const Church = require('../models/church');
const user = require('../models/user');
const Event = require('../models/event');
const EventInstance = require('../models/eventinstance');
const { getChurchTimezone, nowInChurchTz, addTimeInChurchTz } = require('./timezone.helper');
const moment = require('moment-timezone');

class EventService {

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

 getFirstMatchingWeekday(startDate, daysOfWeek, timezone) {
  const start = moment.tz(startDate, timezone);
  const maxLookahead = 7; // one week

  for (let i = 0; i < maxLookahead; i++) {
    const candidate = start.clone().add(i, 'days');
    if (daysOfWeek.includes(candidate.day())) {
      return candidate.toDate();
    }
  }

  return start.toDate(); // fallback if no match (shouldn't happen)
}

async expandRecurringEvents() {

  const events = await Event.find({ isRecurring: true }).populate('church');

  for (const event of events) {
    // Get church timezone for proper date calculations
    const timezone = await getChurchTimezone(event.church);
    const now = nowInChurchTz(timezone);
    const futureLimit = now.clone().add(365, 'days').toDate();
    
    const { recurrence, startDate, startTime, endTime } = event;
    //console.log(`Expanding event ${event._id} (${event.title}) with recurrence:`, recurrence);
    let occurrences = [];
    //let current = new Date(startDate);
    let current = this.getFirstMatchingWeekday(startDate, recurrence.daysOfWeek || [], timezone);
    console.log({current});
    while (current <= futureLimit && (!recurrence.endDate || current <= recurrence.endDate)) {
      const currentMoment = moment.tz(current, timezone);
      const weekday = currentMoment.day();

      if (recurrence.frequency === 'DAILY') {
        occurrences.push(new Date(current));
        current = addTimeInChurchTz(current, recurrence.interval, 'days', timezone);
      } else if (recurrence.frequency === 'WEEKLY' && recurrence.daysOfWeek.includes(weekday)) {
        occurrences.push(new Date(current));
        current = addTimeInChurchTz(current, recurrence.interval * 7, 'days', timezone);
      } else if (recurrence.frequency === 'MONTHLY') {
        occurrences.push(new Date(current));
        current = addTimeInChurchTz(current, recurrence.interval, 'months', timezone);
      } else if (recurrence.frequency === 'YEARLY') {
        occurrences.push(new Date(current));
        current = addTimeInChurchTz(current, recurrence.interval, 'years', timezone);
      } else {
        current = addTimeInChurchTz(current, 1, 'days', timezone);
      }
    }

    const instances = occurrences.map(date => ({
      eventId: event._id,
      church: event.church,
      title: event.title,
      description: event.description,
      location: event.location,
      date,
      startTime,
      endTime,
    }));
    console.log(`Generated ${instances.length} instances for event ${event._id} (${event.title})`);

    // Remove old instances and insert new ones
    await EventInstance.deleteMany({ eventId: event._id });
    await EventInstance.insertMany(instances);
  }
}

  // Create a new event (recurring or single)
  async createEvent(eventData) {
   const  event = await Event.create(eventData);
   console.log('Created Event:', event);
    if (event.isRecurring) {
         await this.expandRecurringEvents(); // cache future instances
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