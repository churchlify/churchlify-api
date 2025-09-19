const Church = require("../models/church");
const user = require("../models/user");
const Event = require("../models/event"); // Adjust the path as needed
const moment = require("moment-timezone");

const sysTimezone = moment.tz.guess();
const checkChurchById = async (id)=> { return Church.findById(id);};
const checkUserById = async (id)=> { return user.findById(id);};

const parseDateTime = async(dateString, timeString) => {
const date = new Date(dateString); // Parse the date string into a Date object
const [hours, minutes] = timeString.split(":").map(Number); // Split the time string into hours and minutes
date.setUTCHours(hours, minutes); // Set the hours and minutes on the date object
return date;
};

const resetIndexesForAllModels = async () => {
  try {
    const mongoose = require("mongoose");
    // Retrieve all registered models in Mongoose
    const models = mongoose.models;
    // Iterate through each model and reset indexes
    for (const modelName in models) {
      const Model = models[modelName];
      console.log(`Processing model: ${modelName}`);
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
    
    console.log("Finished processing all models!");
  } catch (error) {
    console.error("Error resetting indexes:", error.message);
  } 
};

const convertTime = async(time, toZone = "America/Toronto") => {
  return moment.tz(time, "HH:mm", sysTimezone).tz(toZone).format("HH:mm");
};

const getTodaysEvents = async (church) => {
  const today = new Date();
  const churchData = Church.findById(church);
  const churchTimeZone = (churchData.timeZone) ? churchData.timeZone : "America/Toronto";
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const currentTime = await convertTime(today.getHours() + ":" + today.getMinutes(), churchTimeZone);
  try {
    const query = {
        startDate: { $lte: startOfDay }, // Event starts on or before today
        endDate: { $gte: startOfDay },  // Event ends on or after today
        allowKidsCheckin: true,
        church,
        $expr: {
          $and: [
            { $lte: ["$checkinStartTime",currentTime] },
            { $gte: ["$endTime",currentTime] },       
              ]
        }
      };
    const events = await Event.find(query);
    return events;
  } catch (error) {
    console.error("Error fetching today's events:", error);
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

 const getFlatennedMonthEvents = async(d, churchId ="") => {
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
    const events = await Event.find(query);
    events.forEach(event => {
        let currentDate = new Date(event.startDate);
        const eventEndDate = new Date(event.endDate);
        while (currentDate <= eventEndDate && currentDate <= endOfMonth) {
          if (currentDate >= startOfMonth) {
            flattenedEvents.push({
              id: event.id + "_" +event.startDate.toISOString().replace(/[^\w\s]/gi, ""),
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
                  case "daily":
                      currentDate.setDate(currentDate.getDate() + 1);
                      break;
                  case "weekly":
                      currentDate.setDate(currentDate.getDate() + 7);
                      break;
                  case "monthly":
                      currentDate.setMonth(currentDate.getMonth() + 1);
                      break;
                  case "yearly":
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
  };
const sanitizeString = (name) => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-zA-Z0-9-_~.% ]/g, "") // remove invalid chars
    .replace(/\s+/g, "-")               // replace spaces with hyphens
    .substring(0, 100);                 // FCM topic name limit
};

module.exports = {checkChurchById, checkUserById, parseDateTime, getTodaysEvents, convertTime, getFlatennedMonthEvents, resetIndexesForAllModels, sanitizeString}; 
