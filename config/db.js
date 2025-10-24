const mongoose = require('mongoose');
const { seedTimezones, resetIndexesForAllModels } = require('../common/db');

async function connectDB(uri) {
  try {
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');
    await seedTimezones();
    await resetIndexesForAllModels();
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  }
}

module.exports = { connectDB };
