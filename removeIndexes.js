// /scripts/rebuild-indexes.js
const mongoose = require('mongoose');
const fs = require('fs');

const logFile = 'db_errors.log';

const logError = (error) => {
    const errorMsg = `[${new Date().toISOString()}] MongoDB Connection Error: ${error.message}\n`;
    console.error(errorMsg); // Print to console
    fs.appendFileSync(logFile, errorMsg); // Save to log file
};

const MONGO_URI = process.env.MONGO_URI || 'mongodb://lucas:L00krat1ve@mongo_main,mongo_sec,mongo_tri:27017/churchlify?replicaSet=rs0&readPreference=primary';

const rebuildIndexes = async () => {
    try {
        console.log(`Dropping indexes for ... ${MONGO_URI}`);
        await mongoose.connect(MONGO_URI);
        console.log(`Connected: ${MONGO_URI}`);
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        console.log(`CC: ${collections}`);

        for (const collection of collections) {
            const col = db.collection(collection.name);
            console.log(`Dropping indexes for ${collection.name}...`);
            await col.dropIndexes();
            console.log(`Recreating indexes for ${collection.name}...`);
            await col.createIndex({ parent: 1 }); // Modify indexes as per your schema
        }

        console.log('Indexes rebuilt successfully!');
    } catch (error) {
        logError(error);
        console.error('Error rebuilding indexes:', error);
        console.log('Error rebuilding indexes:', error);
    } finally {
        await mongoose.disconnect();
    }
};

// Run the function
rebuildIndexes();
