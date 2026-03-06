// common/redis.connection.js
const IORedis = require('ioredis');

// K8s-aware Redis host resolution
// Supports: redis, redis.platform, redis.platform.svc.cluster.local, or custom IP
const redisHost = process.env.REDIS_HOST || (() => {
    // Default fallback chain for K8s
    const namespace = process.env.K8S_NAMESPACE || 'platform';
    return `redis.${namespace}.svc.cluster.local`;
})();

const redisPort = parseInt(process.env.REDIS_PORT || '6379');

console.log(`Redis: Attempting to connect to ${redisHost}:${redisPort}`);

const connection = new IORedis({
    host: redisHost,
    port: redisPort,
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    enableOfflineQueue: true,
    connectTimeout: 15000,
    commandTimeout: 15000,  // Increased from 5s to handle concurrent startup load
    lazyConnect: false,
    keepAlive: 30000,

    retryStrategy: (times) => {
        // For K8s, allow more retries (pods may take time to start)
        if (times > 30) {
            console.error('Redis: Max retries exceeded, giving up');
            return null;
        }
        const delay = Math.min(times * 200, 10000);
        console.log(`Redis reconnecting... attempt ${times}/30, delay ${delay}ms`);
        return delay;
    },

    reconnectOnError: (err) => {
        const targetErrors = ['READONLY', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'];
        const shouldReconnect = targetErrors.some(e => err.message.includes(e));
        if (shouldReconnect) {
            console.log(`Redis reconnecting due to: ${err.code}`);
        }
        return shouldReconnect;
    },
});

connection.on('ready', () => {
    console.log(`Redis: Connected successfully to ${redisHost}:${redisPort}`);
});

connection.on('error', (err) => {
    console.error(`Redis error [${err.code}]: ${err.message} (${redisHost}:${redisPort})`);
});

connection.on('close', () => {
    console.log('Redis: Connection closed');
});

connection.on('reconnecting', () => {
    console.log('Redis: Reconnecting...');
});

module.exports = connection;