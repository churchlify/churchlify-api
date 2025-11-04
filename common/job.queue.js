const { Queue } = require('bullmq');
const connection = require('./redis.connection');
connection.on('ready', () => {
    console.log(`✅ Redis connection successful to ${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || 6379}`);
});
const notificationQueue = new Queue('notificationBatchQueue', { connection });

notificationQueue.on('error', (error) => {
  console.error('Queue error:', error);
});

module.exports = { 
    notificationQueue, 
    connection 
};