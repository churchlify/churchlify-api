// mediasoup/media-worker.js
/* global */
const { createWorker } = require('mediasoup');
const redisClient = require('./common/redis.connection');

const rooms = new Map(); // In-memory fallback
const mediaTopology = (process.env.MEDIASOUP_TOPOLOGY || 'external').toLowerCase();
const rtcMinPort = Number(process.env.MEDIASOUP_MIN_PORT || 42000);
const rtcMaxPort = Number(process.env.MEDIASOUP_MAX_PORT || 42100);
const signalingTimeoutMs = Number(process.env.MEDIASOUP_SIGNALING_TIMEOUT_MS || 10000);
const signalingApiKey = process.env.MEDIASOUP_SIGNALING_API_KEY;
const signalingBaseUrl = (process.env.MEDIASOUP_SIGNALING_BASE_URL || '').replace(/\/$/, '');
const signalingActionPath = process.env.MEDIASOUP_SIGNALING_ACTION_PATH || '/v1/signaling/actions';

function isRedisReady() {
  return Boolean(redisClient && redisClient.status === 'ready');
}

function ackSuccess(ack, data) {
  if (typeof ack === 'function') {
    ack({ ok: true, data });
  }
}

function ackFailure(ack, error) {
  if (typeof ack === 'function') {
    ack({ ok: false, error: error.message || 'Unknown signaling error' });
  }
}

async function invokeExternalSignaling(action, payload) {
  if (!signalingBaseUrl) {
    throw new Error('MEDIASOUP_SIGNALING_BASE_URL is required in external topology');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), signalingTimeoutMs);

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (signalingApiKey) {
      headers['x-media-api-key'] = signalingApiKey;
    }

    const response = await fetch(`${signalingBaseUrl}${signalingActionPath}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, payload }),
      signal: controller.signal,
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = body?.error || body?.message || `${response.status} ${response.statusText}`;
      throw new Error(`External mediasoup signaling failed: ${reason}`);
    }

    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function invokeSignaling(action, payload) {
  if (mediaTopology === 'external') {
    return invokeExternalSignaling(action, payload);
  }

  throw new Error('Embedded mediasoup signaling actions are not implemented yet. Use MEDIASOUP_TOPOLOGY=external.');
}

async function startWorker(io) {
  if (isRedisReady()) {
        console.log('✅ Reusing central Redis client for room state');
    }
  let worker = null;

  if (mediaTopology === 'embedded') {
    worker = await createWorker({
      logLevel: 'warn',
      rtcMinPort,
      rtcMaxPort,
    });

    worker.on('died', () => {
      console.error('❌ Mediasoup worker died');
      process.exit(1);
    });

    console.log(`✅ Mediasoup worker running (embedded mode, UDP ${rtcMinPort}-${rtcMaxPort})`);
  } else {
    console.log('✅ External mediasoup mode enabled (API signaling only, no local worker)');
  }

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    socket.data.peerId = socket.data.authUserId || null;
    socket.data.rooms = new Set();

    socket.on('joinRoom', async ({ roomId, userId }, ack) => {
      try {
        const authenticatedUserId = socket.data.authUserId;
        const resolvedUserId = authenticatedUserId || userId;

        if (!roomId || !resolvedUserId) {
          throw new Error('roomId and userId are required');
        }

        if (authenticatedUserId && userId && String(authenticatedUserId) !== String(userId)) {
          throw new Error('userId does not match authenticated socket user');
        }

        console.log(`${resolvedUserId} joining room ${roomId}`);
        socket.data.peerId = resolvedUserId;
        socket.data.rooms.add(roomId);

        // Add to Redis or memory
        if (isRedisReady()) {
          await redisClient.sadd(`room:${roomId}`, resolvedUserId);
        } else {
          if (!rooms.has(roomId)){ rooms.set(roomId, new Set());}
          rooms.get(roomId).add(resolvedUserId);
        }

        socket.join(roomId);
        io.to(roomId).emit('userJoined', { userId: resolvedUserId, roomId });

        if (mediaTopology === 'external') {
          await invokeSignaling('joinPeer', {
            roomId,
            peerId: resolvedUserId,
            socketId: socket.id,
          });
        }

        ackSuccess(ack, { roomId, userId: resolvedUserId });
      } catch (error) {
        ackFailure(ack, error);
      }
    });

    socket.on('leaveRoom', async ({ roomId, userId }, ack) => {
      try {
        const resolvedUserId = socket.data.authUserId || socket.data.peerId || userId;
        if (!roomId || !resolvedUserId) {
          throw new Error('roomId and userId are required');
        }

        if (isRedisReady()) {
          await redisClient.srem(`room:${roomId}`, resolvedUserId);
        } else if (rooms.has(roomId)) {
          rooms.get(roomId).delete(resolvedUserId);
        }

        socket.data.rooms.delete(roomId);
        socket.leave(roomId);
        io.to(roomId).emit('userLeft', { userId: resolvedUserId, roomId });

        if (mediaTopology === 'external') {
          await invokeSignaling('leavePeer', {
            roomId,
            peerId: resolvedUserId,
            socketId: socket.id,
          });
        }

        ackSuccess(ack, { roomId, userId: resolvedUserId });
      } catch (error) {
        ackFailure(ack, error);
      }
    });

    socket.on('chatTyping', async ({ roomId, isTyping }, ack) => {
      try {
        if (!roomId) {
          throw new Error('roomId is required');
        }

        const peerId = socket.data.peerId;
        socket.to(roomId).emit('chat:typing', {
          roomId,
          userId: peerId,
          isTyping: Boolean(isTyping),
          at: new Date().toISOString(),
        });
        ackSuccess(ack, { roomId, isTyping: Boolean(isTyping) });
      } catch (error) {
        ackFailure(ack, error);
      }
    });

    socket.on('call:signal', async ({ roomId, type, payload, targetPeerId }, ack) => {
      try {
        if (!roomId || !type) {
          throw new Error('roomId and type are required');
        }

        socket.to(roomId).emit('call:signal', {
          roomId,
          type,
          payload,
          targetPeerId: targetPeerId || null,
          fromPeerId: socket.data.peerId,
          at: new Date().toISOString(),
        });
        ackSuccess(ack, { roomId, type });
      } catch (error) {
        ackFailure(ack, error);
      }
    });

    socket.on('getRouterRtpCapabilities', async ({ roomId }, ack) => {
      try {
        const result = await invokeSignaling('getRouterRtpCapabilities', {
          roomId,
          peerId: socket.data.peerId,
          socketId: socket.id,
        });
        ackSuccess(ack, result);
      } catch (error) {
        ackFailure(ack, error);
      }
    });

    socket.on('createWebRtcTransport', async ({ roomId, direction }, ack) => {
      try {
        const result = await invokeSignaling('createWebRtcTransport', {
          roomId,
          direction,
          peerId: socket.data.peerId,
          socketId: socket.id,
        });
        ackSuccess(ack, result);
      } catch (error) {
        ackFailure(ack, error);
      }
    });

    socket.on('connectWebRtcTransport', async ({ roomId, transportId, dtlsParameters }, ack) => {
      try {
        const result = await invokeSignaling('connectWebRtcTransport', {
          roomId,
          transportId,
          dtlsParameters,
          peerId: socket.data.peerId,
          socketId: socket.id,
        });
        ackSuccess(ack, result);
      } catch (error) {
        ackFailure(ack, error);
      }
    });

    socket.on('produce', async ({ roomId, transportId, kind, rtpParameters, appData }, ack) => {
      try {
        const result = await invokeSignaling('produce', {
          roomId,
          transportId,
          kind,
          rtpParameters,
          appData,
          peerId: socket.data.peerId,
          socketId: socket.id,
        });

        io.to(roomId).emit('newProducer', {
          roomId,
          producerId: result?.producerId,
          peerId: socket.data.peerId,
          kind,
        });

        ackSuccess(ack, result);
      } catch (error) {
        ackFailure(ack, error);
      }
    });

    socket.on('consume', async ({ roomId, transportId, producerId, rtpCapabilities }, ack) => {
      try {
        const result = await invokeSignaling('consume', {
          roomId,
          transportId,
          producerId,
          rtpCapabilities,
          peerId: socket.data.peerId,
          socketId: socket.id,
        });
        ackSuccess(ack, result);
      } catch (error) {
        ackFailure(ack, error);
      }
    });

    socket.on('resumeConsumer', async ({ roomId, consumerId }, ack) => {
      try {
        const result = await invokeSignaling('resumeConsumer', {
          roomId,
          consumerId,
          peerId: socket.data.peerId,
          socketId: socket.id,
        });
        ackSuccess(ack, result);
      } catch (error) {
        ackFailure(ack, error);
      }
    });

    socket.on('closeProducer', async ({ roomId, producerId }, ack) => {
      try {
        const result = await invokeSignaling('closeProducer', {
          roomId,
          producerId,
          peerId: socket.data.peerId,
          socketId: socket.id,
        });
        ackSuccess(ack, result);
      } catch (error) {
        ackFailure(ack, error);
      }
    });

    socket.on('closeConsumer', async ({ roomId, consumerId }, ack) => {
      try {
        const result = await invokeSignaling('closeConsumer', {
          roomId,
          consumerId,
          peerId: socket.data.peerId,
          socketId: socket.id,
        });
        ackSuccess(ack, result);
      } catch (error) {
        ackFailure(ack, error);
      }
    });

    socket.on('listProducers', async ({ roomId }, ack) => {
      try {
        const result = await invokeSignaling('listProducers', {
          roomId,
          peerId: socket.data.peerId,
          socketId: socket.id,
        });
        ackSuccess(ack, result);
      } catch (error) {
        ackFailure(ack, error);
      }
    });

    socket.on('disconnect', async () => {
      console.log('Client disconnected:', socket.id);
      try {
        const peerId = socket.data.peerId;
        const roomIds = Array.from(socket.data.rooms || []);

        for (const roomId of roomIds) {
          if (peerId && isRedisReady()) {
            await redisClient.srem(`room:${roomId}`, peerId);
          }
          socket.leave(roomId);
          if (peerId) {
            io.to(roomId).emit('userLeft', { userId: peerId, roomId });
          }
        }

        if (mediaTopology === 'external' && peerId) {
          await invokeSignaling('disconnectPeer', {
            peerId,
            roomIds,
            socketId: socket.id,
          });
        }
      } catch (error) {
        console.error('Failed to cleanup socket on disconnect:', error.message);
      }
    });
  });

  return worker;
}

module.exports = { startWorker, rooms, redisClient, mediaTopology };
