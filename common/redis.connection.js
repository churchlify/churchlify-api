// common/redis.connection.js
const IORedis = require('ioredis');

const redisHost = process.env.REDIS_HOST || 'redis.default.svc.cluster.local';
const redisPort = parseInt(process.env.REDIS_PORT || '6379');

const connection = new IORedis({
    host: redisHost,
    port: redisPort,
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    enableOfflineQueue: true,
    connectTimeout: 10000,
    commandTimeout: 5000,
    lazyConnect: false,
    keepAlive: 30000,

    retryStrategy: (times) => {
        if (times > 10) {
            console.error('Redis: Max retries exceeded, giving up');
            return null;
        }
        const delay = Math.min(times * 100, 5000);
        console.log(`Redis reconnecting... attempt ${times}, delay ${delay}ms`);
        return delay;
    },

    reconnectOnError: (err) => {
        const targetErrors = ['READONLY', 'ECONNREFUSED', 'ENOTFOUND'];
        const shouldReconnect = targetErrors.some(e => err.message.includes(e));
        if (shouldReconnect) {
            console.log(`Redis reconnecting due to: ${err.code}`);
        }
        return shouldReconnect;
    },
});

connection.on('ready', () => {
    console.log(`Redis connected to ${redisHost}:${redisPort}`);
});

connection.on('error', (err) => {
    console.error(`Redis error [${err.code}]:`, err.message);
});

connection.on('close', () => {
    console.log('Redis connection closed');
});

connection.on('reconnecting', () => {
    console.log('Redis reconnecting...');
});

module.exports = connection;