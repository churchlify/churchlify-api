// Church import removed (unused)
const Event = require('../models/event'); // Adjust the path as needed
const { getMonthBoundaries } = require('./timezone.helper');

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

const parseDateTime = async(dateString, timeString) => {
  // Parse date and time in UTC
  const [year, month, day] = dateString.split('-').map(Number);
  const [hour, minute] = timeString.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute));
};

const convertTime = async(time) => {
  // No timezone conversion, just return time in HH:mm
  return time;
};

const getTodaysEvents = async (church) => {
  // Get today's UTC date boundaries
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const currentTime = now.toISOString().slice(11, 16); // HH:mm in UTC
  try {
    const query = {
      startDate: { $lte: startOfDay },
      endDate: { $gte: startOfDay },
      allowKidsCheckin: true,
      church,
      $expr: {
        $and: [
          { $lte: ['$checkinStartTime', currentTime] },
          { $gte: ['$endTime', currentTime] },
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
    // Use UTC for month calculation
    const inputDate = new Date(d);
    const { startDate: startOfMonth, endDate: endOfMonth } = getMonthBoundaries(
      inputDate.getUTCFullYear(),
      inputDate.getUTCMonth() + 1,
      'UTC'
    );
    let flattenedEvents = [];
    let query = {
      $or: [
        { startDate: { $lte: endOfMonth }, endDate: { $gte: startOfMonth } },
        { startDate: { $gte: startOfMonth, $lte: endOfMonth } }
      ]
    };
    if (churchId) {
      query = { $and: [query, { church: churchId }] };
    }
    const events = await Event.find(query);
    events.forEach(event => {
      let currentDate = new Date(event.startDate);
      const eventEndDate = new Date(event.endDate);
      const endOfMonthDate = new Date(endOfMonth);
      while (currentDate <= eventEndDate && currentDate <= endOfMonthDate) {
        if (currentDate >= new Date(startOfMonth)) {
          flattenedEvents.push({
            id: event.id + '_' + event.startDate.toISOString().replace(/[^\w\s]/gi, ''),
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
        if (event.recurrence) {
          switch (event.recurrence.frequency) {
            case 'daily':
              currentDate.setUTCDate(currentDate.getUTCDate() + 1);
              break;
            case 'weekly':
              currentDate.setUTCDate(currentDate.getUTCDate() + 7);
              break;
            case 'monthly':
              currentDate.setUTCMonth(currentDate.getUTCMonth() + 1);
              break;
            case 'yearly':
              currentDate.setUTCFullYear(currentDate.getUTCFullYear() + 1);
              break;
            default:
              currentDate = new Date(eventEndDate.getTime() + 86400000); // Move past the end date to exit the loop
          }
        } else {
          currentDate = new Date(eventEndDate.getTime() + 86400000);
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
