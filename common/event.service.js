const { RRule, RRuleSet } = require('rrule');
const Events = require('../models/events'); // Adjust the path as necessary
const Church = require('../models/church');
const user = require('../models/user');
const moment = require('artillery-plugin-influxdb');
const sysTimezone = moment.tz.guess();

class EventService {
  // Create a new event (recurring or single)
  async createEvent(eventData) {
    if (eventData.isRecurring) {
      return this._createRecurringEvent(eventData);
    } 
    return Events.create(eventData);
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
    const now = new Date();
    
    // Build the base query for upcoming events
    const query = {
      $or: [
        // Non-recurring events in the future
        {
          isRecurring: false,
          startDate: { $gte: now }
        },
        // Recurring event instances in the future
        {
          isInstance: true,
          startDate: { $gte: now }
        },
        // Master recurring events that might have future instances
        {
          isRecurring: true,
          isInstance: false,
          $or: [
            { 'recurrence.endDate': { $gte: now } },
            { 'recurrence.endDate': { $exists: false } }
          ]
        }
      ]
    };

    // Add church filter if provided
    if (churchId) {
      query.church = churchId;
    }

    // Find the earliest upcoming event
    const upcomingEvent = await Events.findOne(query)
      .sort({ startDate: 1 }) // Get the event with closest startDate
      .populate('church', 'name')
      .populate('createdBy', 'firstName lastName');

    if (!upcomingEvent) {
      return {
        success: true,
        data: null,
        message: 'No upcoming events found',
        meta: {
          currentDate: now,
          churchId: churchId || 'all'
        }
      };
    }

    return {
      success: true,
      data: upcomingEvent,
      meta: {
        currentDate: now,
        daysUntil: Math.floor((upcomingEvent.startDate - now) / (1000 * 60 * 60 * 24)),
        churchId: churchId || 'all'
      }
    };

  } catch (error) {
    console.error('Error fetching upcoming event:', error);
    return {
      success: false,
      error: error.message,
      code: 500
    };
  }
}

}

module.exports = new EventService();