const mongoose = require('mongoose');
const { seedTimezones, resetIndexesForAllModels } = require('../common/db');

async function connectDB(uri) {
  try {
    // Mongoose connection options
    const mongooseOptions = {
      autoIndex: true,            // ✅ Auto-create indexes defined in schemas
      maxPoolSize: 10,            // Connection pool size
      minPoolSize: 5,             // Minimum connections
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    await mongoose.connect(uri, mongooseOptions);
    console.log('✅ Connected to MongoDB');
    console.log('✅ Auto-indexing enabled - indexes will be created from schema definitions');
    
    await seedTimezones();
    await resetIndexesForAllModels();
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  }
}

module.exports = { connectDB };
