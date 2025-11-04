// mediasoup/media-worker.js
const { createWorker } = require('mediasoup');
const redisClient = require('./common/redis.connection');

const rooms = new Map(); // In-memory fallback

async function startWorker(io) {
  if (redisClient && redisClient.status === 'ready') {
        console.log('✅ Reusing central Redis client for room state');
    }
  const worker = await createWorker({
    logLevel: 'warn',
    rtcMinPort: 40000,
    rtcMaxPort: 40100,
  });

  worker.on('died', () => {
    console.error('❌ Mediasoup worker died');
    process.exit(1);
  });

  console.log('✅ Mediasoup worker running');

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('joinRoom', async ({ roomId, userId }) => {
      console.log(`${userId} joining room ${roomId}`);

      // Add to Redis or memory
      if (redisClient) {
        await redisClient.sadd(`room:${roomId}`, userId);
      } else {
        if (!rooms.has(roomId)){ rooms.set(roomId, new Set());}
        rooms.get(roomId).add(userId);
      }

      socket.join(roomId);
      io.to(roomId).emit('userJoined', { userId, roomId });
    });

    socket.on('leaveRoom', async ({ roomId, userId }) => {
      if (redisClient) {
        await redisClient.srem(`room:${roomId}`, userId);
      } else if (rooms.has(roomId)) {
        rooms.get(roomId).delete(userId);
      }

      socket.leave(roomId);
      io.to(roomId).emit('userLeft', { userId, roomId });
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      // Optionally remove from all rooms
    });
  });

  return worker;
}

module.exports = { startWorker, rooms, redisClient };
