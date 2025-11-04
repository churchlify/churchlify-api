// common/redis.connection.js
const IORedis = require('ioredis');

const connection = new IORedis({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT || 6379,
    maxRetriesPerRequest: null,
});

connection.on('ready', () => {
    console.log(`✅ Central Redis connection established.`);
});

connection.on('error', (err) => {
    console.error('❌ Redis connection error:', err.message);
});

module.exports = connection;