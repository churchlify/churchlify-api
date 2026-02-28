// common/redis.connection.js
const IORedis = require('ioredis');

const connection = new IORedis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    enableOfflineQueue: true,
    
    // Retry strategy for resilience
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    
    // Reconnect on read-only errors (cluster failover)
    reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
            return true;
        }
        return false;
    },
});

connection.on('ready', () => {
    console.log(`✅ Central Redis connection established at ${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`);
});

connection.on('error', (err) => {
    console.error('❌ Redis connection error:', err.message);
});

connection.on('close', () => {
    console.log('⚠️ Redis connection closed');
});

module.exports = connection;