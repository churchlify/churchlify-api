const Church = require('../models/church');
const user = require('../models/user');
const Timezone = require('../models/timezone');
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

const checkChurchById = async (id)=> { return Church.findById(id);};
const checkUserById = async (id)=> { return user.findById(id);};

async function seedTimezones() {
  const count = await Timezone.countDocuments();
  if (count === 0) {
    await Timezone.insertMany(timezones);
    console.log('Timezones seeded!');
  } else {
    console.log('Timezones already exist.');
  }
}

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

module.exports = { resetIndexesForAllModels, seedTimezones, checkChurchById, checkUserById };