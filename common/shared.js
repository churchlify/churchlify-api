const Church = require('../models/church');
const Event = require('../models/event'); // Adjust the path as needed
const moment = require('moment-timezone');
const { nowInChurchTz, getDayBoundaries, getMonthBoundaries, parseChurchDateTime } = require('./timezone.helper');
const sysTimezone = moment.tz.guess();

const normalizeValue = (value) => {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch {
      // Ignore if not valid JSON
    }
    if (value === '[object Object]') {
      console.warn('⚠️ Received invalid stringified object. Returning empty object.');
      return {}; // or null, depending on your app’s logic
    }
    return value;
  }
  return value;
};

const parseDateTime = async(dateString, timeString, timezone = 'UTC') => {
  // Use timezone-aware parsing
  return parseChurchDateTime(dateString, timeString, timezone);
};

const convertTime = async(time, toZone = 'America/Toronto') => {
  return moment.tz(time, 'HH:mm', sysTimezone).tz(toZone).format('HH:mm');
};

const getTodaysEvents = async (church) => {
  const churchData = await Church.findById(church);
  const churchTimeZone = (churchData?.timeZone) ? churchData.timeZone : 'America/Toronto';
  
  // Get day boundaries in church timezone
  const now = nowInChurchTz(churchTimeZone);
  const { startOfDay } = getDayBoundaries(now.toDate(), churchTimeZone);
  const currentTime = now.format('HH:mm');
  
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
    const events = await Event.find(query);
    return events;
  } catch (error) {
    console.error('Error fetching today\'s events:', error);
    return error;
  }
};

// const convertTimeToTimezone = (time, sourceTimeZone, targetTimeZone) => {
//   // Parse the HH:MM time into a Date object (default date)
//   const [hours, minutes] = time.split(":").map(Number);
//   // Create a date for today with the given time
//   const now = new Date();
//   const sourceDate = new Date( Date.UTC( now.getFullYear(), now.getMonth(),now.getDate(), hours, minutes) );
//   // Format the source date in the target timezone
//   const formatter = new Intl.DateTimeFormat("en-US", {
//     timeZone: targetTimeZone,
//     hour: "2-digit",
//     minute: "2-digit",
//     hourCycle: "h23",
//   });

//   const formattedTime = formatter.format(sourceDate);
//   return formattedTime;
// };

 const getFlatennedMonthEvents = async(d, churchId ='') => {
    // Get church timezone for proper month calculation
    let churchTimeZone = 'UTC';
    if (churchId) {
      const churchData = await Church.findById(churchId).select('timeZone').lean();
      churchTimeZone = churchData?.timeZone || 'UTC';
    }
    
    const inputMoment = moment.tz(d, churchTimeZone);
    const { startDate: startOfMonth, endDate: endOfMonth } = getMonthBoundaries(
      inputMoment.year(),
      inputMoment.month() + 1,
      churchTimeZone
    );
    
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
    const events = await Event.find(query);
    events.forEach(event => {
        let currentDate = moment.tz(event.startDate, churchTimeZone);
        const eventEndDate = moment.tz(event.endDate, churchTimeZone);
        const endOfMonthMoment = moment.tz(endOfMonth, churchTimeZone);
        
        while (currentDate.isSameOrBefore(eventEndDate) && currentDate.isSameOrBefore(endOfMonthMoment)) {
          if (currentDate.isSameOrAfter(moment.tz(startOfMonth, churchTimeZone))) {
            flattenedEvents.push({
              id: event.id + '_' + event.startDate.toISOString().replace(/[^\w\s]/gi, ''),
              church: event.church,
              title: event.title,
              description: event.description,
              startDate: currentDate.toDate(),
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
                      currentDate.add(1, 'days');
                      break;
                  case 'weekly':
                      currentDate.add(7, 'days');
                      break;
                  case 'monthly':
                      currentDate.add(1, 'months');
                      break;
                  case 'yearly':
                      currentDate.add(1, 'years');
                      break;
                  default:
                      currentDate = eventEndDate.clone().add(1, 'days'); // Move past the end date to exit the loop
              }
          }else{
              currentDate = eventEndDate.clone().add(1, 'days');
          }
        }
      });
    return flattenedEvents;
  };
const sanitizeString = (name) => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-zA-Z0-9-_~.% ]/g, '') // remove invalid chars
    .replace(/\s+/g, '-')               // replace spaces with hyphens
    .substring(0, 100);                 // FCM topic name limit
};


module.exports = {parseDateTime, getTodaysEvents, convertTime, getFlatennedMonthEvents, sanitizeString, normalizeValue};
