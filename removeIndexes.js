// scripts/buildIndexes.js - Optimized index builder for all Churchlify collections
const mongoose = require('mongoose');
const fs = require('fs');
require('dotenv').config();

const logFile = 'indexes_build.log';

const log = (message) => {
    const timestamp = `[${new Date().toISOString()}]`;
    const msg = `${timestamp} ${message}`;
    console.log(msg);
    fs.appendFileSync(logFile, msg + '\n');
};

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/churchlify';

// Import all models
const models = {
    Fellowship: require('./models/fellowship'),
    Assignment: require('./models/assignment'),
    CheckIn: require('./models/checkin'),
    Devotion: require('./models/devotion'),
    Donation: require('./models/donations'),
    DonationItem: require('./models/donationItems'),
    EventInstance: require('./models/eventinstance'),
    Notifications: require('./models/notifications'),
    NotificationStatus: require('./models/notificationStatus'),
    Payment: require('./models/payment'),
    Prayer: require('./models/prayer'),
    Testimony: require('./models/testimony'),
    User: require('./models/user'),
    Verification: require('./models/verification'),
    Audit: require('./models/audits'),
};

const buildIndexes = async () => {
    try {
        log('🔧 Starting index build process...');
        log(`📡 Connecting to MongoDB: ${MONGO_URI}`);

        await mongoose.connect(MONGO_URI, {
            autoIndex: true,
            maxPoolSize: 10,
        });

        log('✅ Connected to MongoDB');

        let successCount = 0;
        let errorCount = 0;

        for (const [modelName, Model] of Object.entries(models)) {
            try {
                const collectionName = Model.collection.name;
                log(`\n📊 Building indexes for ${modelName} (${collectionName})...`);

                // Create indexes using background option (non-blocking)
                const indexInfo = await Model.collection.createIndexes();
                log(`   ✅ ${modelName}: Indexes created successfully`);
                log(`   📈 Index info: ${JSON.stringify(indexInfo).substring(0, 100)}...`);
                successCount++;
            } catch (err) {
                log(`   ❌ ${modelName}: Error - ${err.message}`);
                errorCount++;
            }
        }

        log(`\n${'='.repeat(60)}`);
        log('📊 BUILD SUMMARY');
        log(`${'='.repeat(60)}`);
        log(`✅ Successful: ${successCount} collections`);
        log(`❌ Failed: ${errorCount} collections`);
        log(`${'='.repeat(60)}`);

        if (errorCount === 0) {
            log('\n🎉 All indexes built successfully!');
        } else {
            log('\n⚠️  Some collections had errors. Check log above.');
        }
    } catch (error) {
        log(`\n💥 FATAL ERROR: ${error.message}`);
        log(`Stack: ${error.stack}`);
        throw error;
    } finally {
        await mongoose.disconnect();
        log('\n📴 Disconnected from MongoDB');
    }
};

// Run the function
buildIndexes()
    .then(() => {
        log('✨ Index build completed successfully');
        process.exit(0);
    })
    .catch((err) => {
        log(`✗ Index build failed: ${err.message}`);
        process.exit(1);
    });
