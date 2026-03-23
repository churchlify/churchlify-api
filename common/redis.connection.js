// common/redis.connection.js
const IORedis = require('ioredis');

const CONFIG = {
    host: process.env.REDIS_HOST || `redis.${process.env.K8S_NAMESPACE || 'platform'}.svc.cluster.local`,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    connectTimeout: 10000,
    // KeepAlive is vital for avoiding ETIMEDOUT in cloud VPCs (AWS/GCP)
    keepAlive: 10000, 
    family: 4, 
};

let redisInstance = null;

const createClient = () => {
    const client = new IORedis({
        ...CONFIG,
        // Critical for high-concurrency/Sidekiq-style workloads
        maxRetriesPerRequest: null, 
        enableReadyCheck: true,
        
        retryStrategy(times) {
            const delay = Math.min(times * 50, 2000);
            // Exponential backoff with a cap
            if (times > 20) {
                console.error('Redis: Critical failure. Max retries reached.');
                return null; // Stop retrying
            }
            return delay;
        },

        reconnectOnError(err) {
            const targetError = 'READONLY';
            if (err.message.includes(targetError)) {
                // Return true to force a reconnection when a slave is promoted to master
                return true; 
            }
            return false;
        },
    });

    // Logging & Monitoring
    client.on('connect', () => console.log('Redis: Socket connected.'));
    client.on('ready', () => console.info('Redis: Cluster/Server ready.'));
    client.on('error', (err) => console.error(`Redis Error: ${err.message}`));
    
    // Graceful Shutdown Handler
    process.on('SIGTERM', async () => {
        console.log('Redis: Closing connection...');
        await client.quit();
    });

    return client;
};

// Singleton Export
module.exports = {
    get connection() {
        if (!redisInstance) {
            redisInstance = createClient();
        }
        return redisInstance;
    },
    // Useful for health checks
    async getStatus() {
        return redisInstance ? redisInstance.status : 'disconnected';
    }
};