// scripts/verifyIndexes.js - Verify all indexes were created correctly
const mongoose = require('mongoose');
const fs = require('fs');
require('dotenv').config();

const logFile = 'indexes_verify.log';

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

const verifyIndexes = async () => {
    try {
        log('🔍 Starting index verification...');
        log(`📡 Connecting to MongoDB: ${MONGO_URI}`);
        
        await mongoose.connect(MONGO_URI, {
            maxPoolSize: 10,
        });
        
        log('✅ Connected to MongoDB\n');

        let totalIndexes = 0;
        let collectionsChecked = 0;

        log(`${'='.repeat(80)}`);
        log(`📊 INDEX INVENTORY`);
        log(`${'='.repeat(80)}\n`);

        for (const [modelName, Model] of Object.entries(models)) {
            try {
                const collectionName = Model.collection.name;
                const indexes = await Model.collection.getIndexes();
                const indexCount = Object.keys(indexes).length;
                
                log(`📦 ${modelName.padEnd(20)} (${collectionName})`);
                log(`   Total indexes: ${indexCount}`);
                
                // List each index
                for (const [indexName, indexSpec] of Object.entries(indexes)) {
                    const keys = JSON.stringify(indexSpec.key);
                    const options = indexSpec.background ? ' [BACKGROUND]' : '';
                    const ttl = indexSpec.expireAfterSeconds ? ` [TTL: ${indexSpec.expireAfterSeconds}s]` : '';
                    log(`   • ${indexName}: ${keys}${options}${ttl}`);
                    totalIndexes++;
                }
                
                log('');
                collectionsChecked++;
            } catch (err) {
                log(`   ❌ Error: ${err.message}\n`);
            }
        }

        log(`${'='.repeat(80)}`);
        log(`📊 VERIFICATION SUMMARY`);
        log(`${'='.repeat(80)}`);
        log(`✅ Collections checked: ${collectionsChecked}`);
        log(`📈 Total indexes created: ${totalIndexes}`);
        log(`${'='.repeat(80)}\n`);

        // Recommendations
        log(`💡 RECOMMENDATIONS:`);
        log(`   • Review indexes above to ensure they match your query patterns`);
        log(`   • Monitor slow query log to identify missing indexes`);
        log(`   • Run 'db.collection.stats()' in MongoDB for index sizes`);
        log(`   • Use 'db.currentOp()' to check index build progress\n`);

    } catch (error) {
        log(`\n💥 FATAL ERROR: ${error.message}`);
        log(`Stack: ${error.stack}`);
        throw error;
    } finally {
        await mongoose.disconnect();
        log('📴 Disconnected from MongoDB');
    }
};

// Run the function
verifyIndexes()
    .then(() => {
        log('✨ Index verification completed');
        process.exit(0);
    })
    .catch((err) => {
        log(`✗ Verification failed: ${err.message}`);
        process.exit(1);
    });
