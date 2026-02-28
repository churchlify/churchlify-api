const mongoose = require('mongoose');
const { seedTimezones, resetIndexesForAllModels } = require('../common/db');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function connectDB(uri) {
  try {
    // Mongoose connection options optimized for K8s replica sets
    const mongooseOptions = {
      autoIndex: true,
      maxPoolSize: 10,
      minPoolSize: 5,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      retryWrites: true,
      retryReads: true,
      heartbeatFrequencyMS: 10000,
    };

    // Retry logic for replica set startup
    let connected = false;
    let attempts = 0;
    const maxAttempts = 6;  // 6 * 30s = 3 minutes max wait

    while (!connected && attempts < maxAttempts) {
      try {
        await mongoose.connect(uri, mongooseOptions);
        connected = true;
        console.log('✅ Connected to MongoDB');
        console.log('✅ Auto-indexing enabled - indexes will be created from schema definitions');

        await seedTimezones();
        await resetIndexesForAllModels();
      } catch (err) {
        attempts++;
        if (attempts >= maxAttempts) {
          throw err;
        }
        console.log(`⏳ MongoDB connection failed, retrying... attempt ${attempts}/${maxAttempts}`);
        console.log('Waiting 5 seconds before retry...');
        await sleep(5000);
      }
    }
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }
}

module.exports = { connectDB };
