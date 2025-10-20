const Church = require('../models/church');
const user = require('../models/user');
const DonationPlan = require('../models/donationPlans');
const Setting = require('../models/settings');
const Event = require('../models/event'); // Adjust the path as needed
const Timezone = require('../models/timezone');
const moment = require('moment-timezone');
const crypto = require('crypto');
const {KEY_REGISTRY} = require('./key.registry');
const IV_LENGTH = 16;
const paypal = require('@paypal/checkout-server-sdk');
const fetch = require('node-fetch');
const axios = require('axios');
const sysTimezone = moment.tz.guess();
const checkChurchById = async (id)=> { return Church.findById(id);};
const checkUserById = async (id)=> { return user.findById(id);};
const PAYSTACK_API = 'https://api.paystack.co';
const PAYPAL_API = 'https://api-m.sandbox.paypal.com';
const arrSecrets = ['stripe','paypal','paystack','payment'];
const timezones =[
  {
    'key': 'America/New_York',
    'value': 'Eastern Time (US & Canada)',
    'continent': 'North America'
  },
  {
    'key': 'America/Chicago',
    'value': 'Central Time (US & Canada)',
    'continent': 'North America'
  },
  {
    'key': 'America/Denver',
    'value': 'Mountain Time (US & Canada)',
    'continent': 'North America'
  },
  {
    'key': 'America/Los_Angeles',
    'value': 'Pacific Time (US & Canada)',
    'continent': 'North America'
  },
  {
    'key': 'America/Phoenix',
    'value': 'Arizona Time (no DST)',
    'continent': 'North America'
  },
  {
    'key': 'Europe/London',
    'value': 'Greenwich Mean Time / British Summer Time',
    'continent': 'Europe'
  },
  {
    'key': 'Europe/Paris',
    'value': 'Central European Time',
    'continent': 'Europe'
  },
  {
    'key': 'Europe/Berlin',
    'value': 'Central European Time',
    'continent': 'Europe'
  },
  {
    'key': 'Europe/Moscow',
    'value': 'Moscow Standard Time',
    'continent': 'Europe'
  },
  {
    'key': 'Asia/Kolkata',
    'value': 'India Standard Time',
    'continent': 'Asia'
  },
  {
    'key': 'Asia/Shanghai',
    'value': 'China Standard Time',
    'continent': 'Asia'
  },
  {
    'key': 'Asia/Tokyo',
    'value': 'Japan Standard Time',
    'continent': 'Asia'
  },
  {
    'key': 'Asia/Dubai',
    'value': 'Gulf Standard Time',
    'continent': 'Asia'
  },
  {
    'key': 'Australia/Sydney',
    'value': 'Australian Eastern Time',
    'continent': 'Australia'
  },
  {
    'key': 'Australia/Adelaide',
    'value': 'Australian Central Time',
    'continent': 'Australia'
  },
  {
    'key': 'Australia/Perth',
    'value': 'Australian Western Time',
    'continent': 'Australia'
  },
  {
    'key': 'Pacific/Auckland',
    'value': 'New Zealand Standard Time',
    'continent': 'Oceania'
  },
  {
    'key': 'Africa/Lagos',
    'value': 'West Africa Time',
    'continent': 'Africa'
  },
  {
    'key': 'Africa/Johannesburg',
    'value': 'South Africa Standard Time',
    'continent': 'Africa'
  },
  {
    'key': 'Africa/Nairobi',
    'value': 'East Africa Time',
    'continent': 'Africa'
  },
  {
    'key': 'America/Sao_Paulo',
    'value': 'Brasília Time',
    'continent': 'South America'
  },
  {
    'key': 'America/Buenos_Aires',
    'value': 'Argentina Time',
    'continent': 'South America'
  },
  {
    'key': 'America/Santiago',
    'value': 'Chile Standard Time',
    'continent': 'South America'
  }
];


 const generateUniqueReference = (timestamp = Date.now()) => {
  const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `churchlify_${timestamp}_${randomPart}`;
};


const getUser = async (userId) => {
      return await user.findById(userId);
  };

const getPaypalClient = (data) => {
  const mode = (data && (data.provider==='paypal') && data.mode) || process.env.PAYPAL_MODE || 'sandbox';
  if (mode === 'live') {
    return new paypal.core.PayPalHttpClient(new paypal.core.LiveEnvironment(data.clientId, data.clientSecret));
  }
  return new paypal.core.PayPalHttpClient(new paypal.core.SandboxEnvironment(data.clientId, data.clientSecret));
};

const getPayPalAccessToken = async(clientId, secret) => {
  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
  const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await response.json();
  if (!response.ok) {throw new Error(data.error_description || 'Failed to get PayPal token');}
  return data.access_token;
};


const encrypt = (input, version = 'v1') => {
  const key = Buffer.from(KEY_REGISTRY[version], 'utf8');
  const iv = crypto.randomBytes(IV_LENGTH);
  const text = typeof input === 'string' ? input : JSON.stringify(input);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
};

const decrypt = (encryptedText, version) => {
  const key = Buffer.from(KEY_REGISTRY[version], 'utf8');
  const [ivHex, encryptedHex] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  const decryptedString = decrypted.toString('utf8');
  try {
    return JSON.parse(decryptedString);
  } catch {
    return decryptedString;
  }
};

const getPaymentSettings = async (churchId) => {
  const regex = arrSecrets.join('|');
  const settings = await Setting.findOne({ church: churchId, key: { $regex: regex, $options: 'i' }}).populate('church');
  if (!settings) {throw new Error('Church payment settings not found');}
  return decrypt(settings.value, settings.keyVersion); // returns { key, provider }
};

const getOrCreatePlan =  async function ({churchId, name, amount,interval,currency = 'NGN'}) {

  try {
    const { secretKey, provider } = await getPaymentSettings(churchId);
    if (!secretKey) {throw new Error('Missing payment API key for this church');}
    let plan = await DonationPlan.findOne({churchId, amount, interval,provider});

    if (plan) {
      return plan;
    }
    const res = await axios.post(`${PAYSTACK_API}/plan`, { name, amount: amount * 100, interval, currency},
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const { plan_code: planCode, id: providerId } = res.data.data;
    plan = await DonationPlan.create({
      churchId, planCode, name, amount,interval, provider: 'paystack',providerId,
    });
    return plan;
  } catch (error) {
    console.error('❌ Error in getOrCreatePlan:', error.response?.data || error);
    throw new Error('Failed to get or create Paystack plan');
  }
};

const getPaymentKey = (data) => {
  switch (data.provider) {
    case 'paypal':
      return data.clientId || '';
    case 'stripe':
      return data.publishableKey || '';
    case 'paystack':
      return data.publicKey || '';
    default:
      return '';
  }
};

const isSecret = (item) => {
  return arrSecrets.some(sub => item.toLowerCase().includes(sub.toLowerCase()));
};
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
    // Handle accidental "[object Object]"
    if (value === '[object Object]') {
      console.warn('⚠️ Received invalid stringified object. Returning empty object.');
      return {}; // or null, depending on your app’s logic
    }
    return value;
  }
  return value;
};


async function seedTimezones() {
  const count = await Timezone.countDocuments();
  if (count === 0) {
    await Timezone.insertMany(timezones);
    console.log('Timezones seeded!');
  } else {
    console.log('Timezones already exist.');
  }
}

const parseDateTime = async(dateString, timeString) => {
const date = new Date(dateString); // Parse the date string into a Date object
const [hours, minutes] = timeString.split(':').map(Number); // Split the time string into hours and minutes
date.setUTCHours(hours, minutes); // Set the hours and minutes on the date object
return date;
};

const resetIndexesForAllModels = async () => {
  try {
    const mongoose = require('mongoose');
    // Retrieve all registered models in Mongoose
    const models = mongoose.models;
    // Iterate through each model and reset indexes
    for (const modelName in models) {
      const Model = models[modelName];
      try {
        await Model.collection.dropIndexes();
      } catch (err) {
        console.error(`Error dropping indexes for ${modelName}:`, err.message);
      }

      // Recreate indexes based on schema definitions
      try {
        await Model.syncIndexes();
      } catch (err) {
        console.error(`Error syncing indexes for ${modelName}:`, err.message);
      }
    }
    console.log('Finished processing all models indexes!');
  } catch (error) {
    console.error('Error resetting indexes:', error.message);
  }
};

const convertTime = async(time, toZone = 'America/Toronto') => {
  return moment.tz(time, 'HH:mm', sysTimezone).tz(toZone).format('HH:mm');
};

const getTodaysEvents = async (church) => {
  const today = new Date();
  const churchData = Church.findById(church);
  const churchTimeZone = (churchData.timeZone) ? churchData.timeZone : 'America/Toronto';
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const currentTime = await convertTime(today.getHours() + ':' + today.getMinutes(), churchTimeZone);
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

module.exports = {checkChurchById, checkUserById, parseDateTime, getTodaysEvents, convertTime, getFlatennedMonthEvents,
   resetIndexesForAllModels, sanitizeString, seedTimezones, encrypt, decrypt, normalizeValue, isSecret, getPaymentKey, arrSecrets,
  getUser, getPaymentSettings, generateUniqueReference, getOrCreatePlan, getPayPalAccessToken, getPaypalClient};
