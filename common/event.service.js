const { RRule, RRuleSet } = require('rrule');
const Events = require('../models/events'); // Adjust the path as necessary
const Church = require('../models/church');
const user = require('../models/user');
const moment = require('moment-timezone');
const sysTimezone = moment.tz.guess();
const { DateTime } = require('luxon');
const Event = require('../models/event'); // Adjust the path as necessary
const EventInstance = require('../models/eventinstance'); // Adjust the path as necessary
const { addDays, addMonths, addYears } = require('date-fns');

class EventService {



async expandRecurringEvents() {
  
  const now = new Date();
  const futureLimit = addDays(now, 60);
  const events = await Event.find({ isRecurring: true });

  for (const event of events) {
    const { recurrence, startDate, startTime, endTime } = event;

    let occurrences = [];
    let current = new Date(startDate);

    while (current <= futureLimit && (!recurrence.endDate || current <= recurrence.endDate)) {
      const weekday = current.getDay();

      if (recurrence.frequency === 'DAILY') {
        occurrences.push(new Date(current));
        current = addDays(current, recurrence.interval);
      } else if (recurrence.frequency === 'WEEKLY' && recurrence.daysOfWeek.includes(weekday)) {
        occurrences.push(new Date(current));
        current = addDays(current, 1); // check next day
      } else if (recurrence.frequency === 'MONTHLY') {
        occurrences.push(new Date(current));
        current = addMonths(current, recurrence.interval);
      } else if (recurrence.frequency === 'YEARLY') {
        occurrences.push(new Date(current));
        current = addYears(current, recurrence.interval);
      } else {
        current = addDays(current, 1);
      }
    }

    const instances = occurrences.map(date => ({
      eventId: event._id,
      churchId: event.churchId,
      title: event.title,
      description: event.description,
      location: event.location,
      date,
      startTime,
      endTime,
    }));

    // Remove old instances and insert new ones
    await EventInstance.deleteMany({ eventId: event._id });
    await EventInstance.insertMany(instances);
  }
}


  // Create a new event (recurring or single)
  async createEvent(eventData) {
   const  event = Event.create(eventData);
    if (event.isRecurring) {
         return await this.expandRecurringEvents(); // cache future instances
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

  // Create recurring event and generate initial instances
  async _createRecurringEvent(masterData) {
    const masterEvent = await Events.create({
      ...masterData,
      isInstance: false,
      nextCheckDate: this._calculateNextCheckDate(masterData)
    });

    // Generate instances for the next 6 months
    await this._generateInstances(masterEvent, 6);
    return masterEvent;
  }

  // Update an event (handles both single and recurring)
  async updateEvent(eventId, updates) {
    const event = await Events.findById(eventId);
    if (!event){ throw new Error('Event not found');}

    if (event.isRecurring && !event.isInstance) {
      return this._updateRecurringMaster(event, updates);
    }
    
    if (event.isInstance) {
      return this._updateInstance(event, updates);
    }

    // Regular single event update
    return Events.findByIdAndUpdate(eventId, updates, { new: true });
  }

  async _updateRecurringMaster(masterEvent, updates) {
    // Update master
    const updatedMaster = await Events.findByIdAndUpdate(
      masterEvent._id, 
      { 
        ...updates,
        nextCheckDate: this._calculateNextCheckDate({ ...masterEvent.toObject(), ...updates })
      }, 
      { new: true }
    );

    // Delete all future instances (past instances remain unchanged)
    await Events.deleteMany({ 
      masterEventId: masterEvent._id,
      startDate: { $gte: new Date() }
    });

    // Regenerate instances
    await this._generateInstances(updatedMaster, 6);
    return updatedMaster;
  }

  async _updateInstance(instance, updates) {
    // For single instance updates (exceptions to the rule)
    return Events.findByIdAndUpdate(instance._id, updates, { new: true });
  }

  // Delete an event (handles both single and recurring)
  async deleteEvent(eventId) {
    const event = await Events.findById(eventId);
    if (!event) {throw new Error('Event not found');}

    if (event.isRecurring && !event.isInstance) {
      // Delete master and all instances
      await Events.deleteMany({
        $or: [
          { _id: event._id },
          { masterEventId: event._id }
        ]
      });
      return;
    }

    // For single instances of recurring events, mark as exception
    if (event.isInstance) {
      await Events.findByIdAndUpdate(event.masterEventId, {
        $addToSet: { 'recurrence.exceptions': event.originalStartDate }
      });
    }

    // Delete the event (or instance)
    return Events.findByIdAndDelete(eventId);
  }

  // Generate event instances up to X months ahead
  async _generateInstances(masterEvent, monthsAhead) {
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + monthsAhead);

    const rule = this._createRRule(masterEvent);
    const dates = rule.between(new Date(), endDate);
    console.log('Generated Dates:', dates);
    const instances = dates.map(date => ({
      ...this._extractInstanceFields(masterEvent),
      startDate: this._combineDateAndTime(date, masterEvent.startTime),
      endDate: this._combineDateAndTime(date, masterEvent.endTime),
      originalStartDate: date
    }));

    if (instances.length > 0) {
      await Events.insertMany(instances);
    }
  }

  // Helper methods
 _createRRule(event) {
    const options = {
      freq: RRule[event.recurrence.frequency],
      interval: event.recurrence.interval || 1,
      dtstart: event.startDate
    };

    if (event.recurrence.endDate) {
      options.until = event.recurrence.endDate;
    }

    // Handle byWeekDay safely
    if (event.recurrence.byWeekDay?.length) {
      options.byweekday = event.recurrence.byWeekDay.map(dayNum => {
        const weekdays = [RRule.SU, RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA];
        if (dayNum >= 0 && dayNum <= 6) {return weekdays[dayNum];}
        throw new Error(`Invalid weekday number: ${dayNum}`);
      });
    }

    const rule = new RRule(options);
    const ruleSet = new RRuleSet();

    ruleSet.rrule(rule);

    // Add exceptions
    if (event.recurrence.exceptions) {
      event.recurrence.exceptions.forEach(date => {
        ruleSet.exdate(new Date(date));
      });
    }

    return ruleSet;
  }

  _extractInstanceFields(masterEvent) {
    return {
      church: masterEvent.church,
      createdBy: masterEvent.createdBy,
      title: masterEvent.title,
      description: masterEvent.description,
      startTime: masterEvent.startTime,
      endTime: masterEvent.endTime,
      location: masterEvent.location,
      flier: masterEvent.flier,
      allowKidsCheckin: masterEvent.allowKidsCheckin,
      rsvp: masterEvent.rsvp,
      checkinStartTime: masterEvent.checkinStartTime,
      isRecurring: false,
      isInstance: true,
      masterEventId: masterEvent._id
    };
  }

  _combineDateAndTime(date, timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const newDate = new Date(date);
    newDate.setHours(hours, minutes, 0, 0);
    return newDate;
  }

  _calculateNextCheckDate(event) {
    if (!event.isRecurring) {return null;}
    
    const monthsToLookAhead = 3; // Regenerate 3 months before we run out
    const checkDate = new Date(event.startDate);
    checkDate.setMonth(checkDate.getMonth() - monthsToLookAhead);
    
    return checkDate > new Date() ? checkDate : new Date();
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
  
  async resetIndexesForAllModels () {
    try {
      const mongoose = require('mongoose');
      // Retrieve all registered models in Mongoose
      const models = mongoose.models;
      // Iterate through each model and reset indexes
      for (const modelName in models) {
        const Model = models[modelName];
        console.log(`Processing model: ${modelName}`);
  
        // Drop existing indexes
        try {
          await Model.collection.dropIndexes();
          console.log(`Dropped indexes for model: ${modelName}`);
        } catch (err) {
          console.error(`Error dropping indexes for ${modelName}:`, err.message);
        }
  
        // Recreate indexes based on schema definitions
        try {
          await Model.syncIndexes();
          console.log(`Recreated indexes for model: ${modelName}`);
        } catch (err) {
          console.error(`Error syncing indexes for ${modelName}:`, err.message);
        }
      }
      
      console.log('Finished processing all models!');
    } catch (error) {
      console.error('Error resetting indexes:', error.message);
    } 
  }
  
  
  convertTime(time, toZone = 'America/Toronto'){
    return moment.tz(time, 'HH:mm', sysTimezone).tz(toZone).format('HH:mm');
  }
  
  
  async getTodaysEvents(church){
    const today = new Date();
    const churchData = Church.findById(church);
    const churchTimeZone = (churchData.timeZone) ? churchData.timeZone : 'America/Toronto';
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const currentTime = this.convertTime(today.getHours() + ':' + today.getMinutes(), churchTimeZone);
    try {
      const query = {
          startDate: { $lte: startOfDay }, // Event starts on or before today
          endDate: { $gte: startOfDay },  // Event ends on or after today
          allowKidsCheckin: true,
          church,
          $expr: {
            $and: [
              { $lte: ['$checkinStartTime',currentTime] },
              { $gte: ['$endTime',currentTime] },       
                ]
          }
        };
      const events = await Events.find(query);
      return events;
    } catch (error) {
      console.error('Error fetching todays events:', error);
      return error;
    }
  }

   async _getFlatennedMonthEvents(d, churchId ='') {
      const startOfMonth = new Date(new Date(d).getFullYear(), new Date(d).getMonth(), 1);
      const endOfMonth = new Date(new Date(d).getFullYear(), new Date(d).getMonth() + 1, 0);
      let flattenedEvents =[];
      let query = {
          $or: [
              { startDate: { $lte: endOfMonth }, endDate: { $gte: startOfMonth } },
              { startDate: { $gte: startOfMonth, $lte: endOfMonth } }
          ]
      };
      if (churchId){
        query =  { $and: [ query, {church: churchId}] };
      }
      const events = await Events.find(query);
      events.forEach(event => {
          let currentDate = new Date(event.startDate);
          const eventEndDate = new Date(event.endDate);
          while (currentDate <= eventEndDate && currentDate <= endOfMonth) {
            if (currentDate >= startOfMonth) {
              flattenedEvents.push({
                id: event.id + '_' +event.startDate.toISOString().replace(/[^\w\s]/gi, ''),
                church: event.church,
                title: event.title,
                description: event.description,
                startDate: new Date(currentDate),
                startTime: event.startTime,
                endTime: event.endTime,
                createdBy: event.createdBy,
                location: event.location,
                flier: event.flier,
                reminder: event.reminder,
              });
            }
  
            if(event.recurrence){
                switch (event.recurrence.frequency) {
                    case 'daily':
                        currentDate.setDate(currentDate.getDate() + 1);
                        break;
                    case 'weekly':
                        currentDate.setDate(currentDate.getDate() + 7);
                        break;
                    case 'monthly':
                        currentDate.setMonth(currentDate.getMonth() + 1);
                        break;
                    case 'yearly':
                        currentDate.setFullYear(currentDate.getFullYear() + 1);
                        break;
                    default:
                        currentDate = new Date(eventEndDate.getTime() + 1); // Move past the end date to exit the loop
                }
            }else{
                currentDate = new Date(eventEndDate.getTime() + 1);
            }
            //  console.log("currentDate", currentDate,event)
          }
        });
      // console.log("flattenedEvents", flattenedEvents)
      return flattenedEvents;
    }

   async getEvents({ from, to, churchId }) {
  try {
    // Parse input dates
    console.log('Input Dates:', { from, to, churchId });
    const startDate = new Date(from);
    if (isNaN(startDate.getTime())) {
      throw new Error('Invalid from date format. Use YYYY-MM-DD');
    }

    // Set default to date to end of month if not provided
    let endDate;
    if (!to) {
      endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
      endDate.setHours(23, 59, 59, 999);
    } else {
      endDate = new Date(to);
      if (isNaN(endDate.getTime())) {
        throw new Error('Invalid to date format. Use YYYY-MM-DD');
      }
      endDate.setHours(23, 59, 59, 999);
    }

    // Build query conditions
    const query = {
      $or: [
        // Non-recurring events in range
        {
          isRecurring: false,
          startDate: { $gte: startDate, $lte: endDate }
        },
        // Recurring event instances in range
        {
          isInstance: true,
          startDate: { $gte: startDate, $lte: endDate }
        },
        // Master recurring events that might have instances in range
        {
          isRecurring: true,
          isInstance: false,
          $or: [
            { 
              'recurrence.endDate': { $gte: startDate },
              startDate: { $lte: endDate }
            },
            { 
              'recurrence.endDate': { $exists: false },
              startDate: { $lte: endDate }
            }
          ]
        }
      ]
    };

    // Add church filter if provided
    if (churchId) {
      query.church = churchId;
    }

    // Execute query
    const events = await Events.find(query)
      .sort({ startDate: 1 })
      .populate('church', 'name')
      .populate('createdBy', 'firstName lastName');

    return {
      success: true,
      data: events,
      meta: {
        startDate,
        endDate,
        churchId: churchId || 'all',
        count: events.length
      }
    };

  } catch (error) {
    console.error('Error fetching events:', error);
    return {
      success: false,
      error: error.message,
      code: error.name === 'ValidationError' ? 400 : 500
    };
  }
}

async getUpcomingEvent({ churchId } = {}) {
  try {
    // 1. Get current time in UTC (three equivalent ways)
    const now = new Date();
    // const utcNow = new Date(now.toISOString());  // Method 1
    // const utcNow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()));  // Method 2
    const utcNow = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));  // Method 3

    console.log('[DEBUG] Current UTC time:', utcNow.toISOString());

    // 2. Build the query conditions
    const query = {
      $or: [
        // Non-recurring future events
        { 
          isRecurring: false,
          startDate: { $gt: utcNow }
        },
        // Recurring instances in future
        {
          isInstance: true,
          startDate: { $gt: utcNow }
        },
        // Master recurring events that could generate future instances
        {
          isRecurring: true,
          isInstance: false,
          $or: [
            { 'recurrence.endDate': { $gt: utcNow } },
            { 'recurrence.endDate': { $exists: false } }
          ]
        }
      ]
    };

    if (churchId) {
      query.church = churchId;
      console.log('[DEBUG] Added church filter:', churchId);
    }

    console.log('[DEBUG] Final query:', JSON.stringify(query, null, 2));

    // 3. Execute query with debugging
    const upcomingEvent = await Events.findOne(query)
      .sort({ startDate: 1 })
      .populate('church', 'name')
      .populate('createdBy', 'firstName lastName');

    if (!upcomingEvent) {
      console.log('[DEBUG] No events found matching query');
      
      // Verification query - find ANY future event without filters
      const anyFutureEvent = await Events.findOne({ startDate: { $gt: utcNow } });
      console.log('[DEBUG] Any future event exists?:', anyFutureEvent ? true : false);
      
      return {
        success: true,
        data: null,
        message: 'No upcoming events found',
        meta: {
          queryTime: utcNow.toISOString(),
          churchFilter: churchId || 'all'
        }
      };
    }

    console.log('[DEBUG] Found event:', {
      id: upcomingEvent._id,
      title: upcomingEvent.title,
      startDate: upcomingEvent.startDate.toISOString(),
      isRecurring: upcomingEvent.isRecurring,
      isInstance: upcomingEvent.isInstance
    });

    // 4. Final validation
    if (new Date(upcomingEvent.startDate) <= utcNow) {
      console.warn('[WARNING] Returned event is in the past!', {
        eventDate: upcomingEvent.startDate.toISOString(),
        currentTime: utcNow.toISOString()
      });
    }

    return {
      success: true,
      data: upcomingEvent,
      meta: {
        currentTime: utcNow.toISOString(),
        daysUntil: Math.ceil((new Date(upcomingEvent.startDate) - utcNow) / (1000 * 60 * 60 * 24)),
        churchId: churchId || 'all'
      }
    };

  } catch (error) {
    console.error('[ERROR] Failed to fetch events:', error);
    return {
      success: false,
      error: 'Failed to retrieve upcoming event',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      code: 500
    };
  }
}

 getNextOccurrence(event, now) {
  const {
    frequency,
    interval = 1,
    endDate,
    endAfterOccurrences,
    byWeekDay,
    byMonthDay,
    exceptions = []
  } = event.recurrence;

  const startDate = DateTime.fromJSDate(event.startDate).startOf('day');
  let occurrence = startDate;
  let count = 0;

  // Convert exception dates to ISO strings for easier matching
  const exceptionSet = new Set(exceptions.map(d => DateTime.fromJSDate(d).toISODate()));

  while (occurrence <= now || exceptionSet.has(occurrence.toISODate())) {
    switch (frequency) {
      case 'DAILY':
        occurrence = occurrence.plus({ days: interval });
        break;
      case 'WEEKLY':
        occurrence = occurrence.plus({ weeks: interval });
        // Apply byWeekDay filtering
        if (byWeekDay && byWeekDay.length) {
          const weekStart = occurrence.startOf('week');
          for (let i = 0; i < 7; i++) {
            const day = weekStart.plus({ days: i });
            if (day >= now && byWeekDay.includes(day.weekday % 7) && !exceptionSet.has(day.toISODate())) {
              return day;
            }
          }
        }
        break;
      case 'MONTHLY':
        occurrence = occurrence.plus({ months: interval });
        if (byMonthDay && byMonthDay.length) {
          for (const day of byMonthDay) {
            const tryDate = occurrence.set({ day });
            if (tryDate.isValid && tryDate >= now && !exceptionSet.has(tryDate.toISODate())) {
              return tryDate;
            }
          }
        }
        break;
      case 'YEARLY':
        occurrence = occurrence.plus({ years: interval });
        break;
    }

    if (endDate && occurrence > DateTime.fromJSDate(endDate)) {
      return null;
    }

    count++;
    if (endAfterOccurrences && count >= endAfterOccurrences) {
      return null;
    }
  }

  return occurrence;
}


async getNextUpcomingEvent() {
  const now = DateTime.utc();

  // Step 1: Get next one-time event (not recurring)
  const oneTimeEvent = await Events.findOne({
    isRecurring: false,
    startDate: { $gte: now.toJSDate() }
  }).sort({ startDate: 1, startTime: 1 });

  // Step 2: Get all recurring events
  const recurringEvents = await Events.find({
    isRecurring: true,
    $or: [
      { 'recurrence.endDate': { $exists: false } },
      { 'recurrence.endDate': { $gte: now.toJSDate() } }
    ]
  });

  // Step 3: Compute next occurrences of recurring events
  const upcomingInstances = [];
  for (const event of recurringEvents) {
    const nextDate = this.getNextOccurrence(event, now);
    if (nextDate) {
      upcomingInstances.push({ event, nextDate });
    }
  }

  // Step 4: Combine and find the earliest
  const allEvents = [];

  if (oneTimeEvent) {
    allEvents.push({
      event: oneTimeEvent,
      nextDate: DateTime.fromJSDate(oneTimeEvent.startDate)
    });
  }

  allEvents.push(...upcomingInstances);

  allEvents.sort((a, b) => a.nextDate.toMillis() - b.nextDate.toMillis());

  return allEvents.length > 0 ? allEvents[0].event : null;
}



}

module.exports = new EventService();