import { createWorker } from 'mediasoup';
import http from 'http';

const HTTP_PORT = Number(process.env.PORT || process.env.HTTP_PORT || 3000);
const RTC_MIN_PORT = Number(process.env.MEDIASOUP_MIN_PORT || 42000);
const RTC_MAX_PORT = Number(process.env.MEDIASOUP_MAX_PORT || 42100);
const ANNOUNCED_IP = process.env.MEDIASOUP_ANNOUNCED_IP || process.env.PUBLIC_IP || undefined;
const SIGNALING_ACTION_PATH = process.env.MEDIASOUP_SIGNALING_ACTION_PATH || '/v1/signaling/actions';
const SIGNALING_API_KEY = process.env.MEDIASOUP_SIGNALING_API_KEY || process.env.SIGNALING_API_KEY || '';
const INITIAL_OUTGOING_BITRATE = Number(process.env.MEDIASOUP_INITIAL_OUTGOING_BITRATE || 1000000);
const MAX_REQUEST_BYTES = Number(process.env.MAX_REQUEST_BYTES || 1048576);

const rooms = new Map();

const routerMediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/H264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '42e01f',
      'level-asymmetry-allowed': 1,
    },
  },
];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,x-media-api-key',
  });
  res.end(JSON.stringify(payload));
}

function safeClose(entity) {
  if (!entity) {
    return;
  }
  try {
    if (typeof entity.close === 'function' && !entity.closed) {
      entity.close();
    }
  } catch (err) {
    // Intentionally ignore close errors during cleanup.
    console.warn('Safe close warning:', err.message);
  }
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';

    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > MAX_REQUEST_BYTES) {
        reject(new HttpError(413, 'Payload too large'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new HttpError(400, `Invalid JSON body: ${err.message}`));
      }
    });

    req.on('error', () => {
      reject(new HttpError(400, 'Malformed request body'));
    });
  });
}

function requireActionFields(payload, fields) {
  fields.forEach((field) => {
    if (payload?.[field] === undefined || payload?.[field] === null || payload?.[field] === '') {
      throw new HttpError(400, `${field} is required`);
    }
  });
}

function roomStats(room) {
  return {
    peers: room.peers.size,
    transports: room.transports.size,
    producers: room.producers.size,
    consumers: room.consumers.size,
  };
}

function maybeCleanupRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }

  if (room.peers.size || room.transports.size || room.producers.size || room.consumers.size) {
    return;
  }

  safeClose(room.router);
  rooms.delete(roomId);
  console.log(`Room ${roomId} deleted`);
}

function getRoomOrThrow(roomId) {
  const room = rooms.get(roomId);
  if (!room) {
    throw new HttpError(404, `Room ${roomId} not found`);
  }
  return room;
}

function ensurePeer(room, peerId, socketId) {
  let peer = room.peers.get(peerId);
  if (!peer) {
    peer = {
      peerId,
      socketId: socketId || null,
      transports: new Set(),
      producers: new Set(),
      consumers: new Set(),
      lastSeenAt: new Date(),
    };
    room.peers.set(peerId, peer);
  }

  if (socketId) {
    peer.socketId = socketId;
  }
  peer.lastSeenAt = new Date();

  return peer;
}

function getTransportEntry(room, transportId, peerId) {
  const entry = room.transports.get(transportId);
  if (!entry) {
    throw new HttpError(404, `Transport ${transportId} not found`);
  }
  if (peerId && entry.peerId !== peerId) {
    throw new HttpError(403, 'Transport does not belong to requesting peer');
  }
  return entry;
}

function getProducerEntry(room, producerId, peerId) {
  const entry = room.producers.get(producerId);
  if (!entry) {
    throw new HttpError(404, `Producer ${producerId} not found`);
  }
  if (peerId && entry.peerId !== peerId) {
    throw new HttpError(403, 'Producer does not belong to requesting peer');
  }
  return entry;
}

function getConsumerEntry(room, consumerId, peerId) {
  const entry = room.consumers.get(consumerId);
  if (!entry) {
    throw new HttpError(404, `Consumer ${consumerId} not found`);
  }
  if (peerId && entry.peerId !== peerId) {
    throw new HttpError(403, 'Consumer does not belong to requesting peer');
  }
  return entry;
}

function cleanupConsumer(roomId, consumerId, closeConsumer = true) {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }

  const entry = room.consumers.get(consumerId);
  if (!entry) {
    return;
  }

  if (closeConsumer) {
    safeClose(entry.consumer);
  }

  room.consumers.delete(consumerId);
  const peer = room.peers.get(entry.peerId);
  if (peer) {
    peer.consumers.delete(consumerId);
  }

  maybeCleanupRoom(roomId);
}

function cleanupProducer(roomId, producerId, closeProducer = true) {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }

  const entry = room.producers.get(producerId);
  if (!entry) {
    return;
  }

  if (closeProducer) {
    safeClose(entry.producer);
  }

  room.producers.delete(producerId);
  const peer = room.peers.get(entry.peerId);
  if (peer) {
    peer.producers.delete(producerId);
  }

  for (const [consumerId, consumerEntry] of room.consumers.entries()) {
    if (consumerEntry.producerId === producerId) {
      cleanupConsumer(roomId, consumerId, true);
    }
  }

  maybeCleanupRoom(roomId);
}

function cleanupTransport(roomId, transportId, closeTransport = true) {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }

  const entry = room.transports.get(transportId);
  if (!entry) {
    return;
  }

  if (closeTransport) {
    safeClose(entry.transport);
  }

  room.transports.delete(transportId);

  const peer = room.peers.get(entry.peerId);
  if (peer) {
    peer.transports.delete(transportId);
  }

  for (const producerId of [...room.producers.keys()]) {
    const producerEntry = room.producers.get(producerId);
    if (producerEntry?.transportId === transportId) {
      cleanupProducer(roomId, producerId, true);
    }
  }

  for (const consumerId of [...room.consumers.keys()]) {
    const consumerEntry = room.consumers.get(consumerId);
    if (consumerEntry?.transportId === transportId) {
      cleanupConsumer(roomId, consumerId, true);
    }
  }

  maybeCleanupRoom(roomId);
}

function closePeer(roomId, peerId) {
  const room = rooms.get(roomId);
  if (!room) {
    return false;
  }

  const peer = room.peers.get(peerId);
  if (!peer) {
    return false;
  }

  for (const consumerId of [...peer.consumers]) {
    cleanupConsumer(roomId, consumerId, true);
  }
  for (const producerId of [...peer.producers]) {
    cleanupProducer(roomId, producerId, true);
  }
  for (const transportId of [...peer.transports]) {
    cleanupTransport(roomId, transportId, true);
  }

  room.peers.delete(peerId);
  maybeCleanupRoom(roomId);
  return true;
}

async function ensureRoom(roomId, worker) {
  if (rooms.has(roomId)) {
    return rooms.get(roomId);
  }

  const router = await worker.createRouter({ mediaCodecs: routerMediaCodecs });
  const room = {
    roomId,
    router,
    peers: new Map(),
    transports: new Map(),
    producers: new Map(),
    consumers: new Map(),
    createdAt: new Date(),
  };

  rooms.set(roomId, room);
  console.log(`Room ${roomId} created`);
  return room;
}

function authorizeRequest(req) {
  if (!SIGNALING_API_KEY) {
    return;
  }

  const incoming = req.headers['x-media-api-key'];
  if (incoming !== SIGNALING_API_KEY) {
    throw new HttpError(401, 'Invalid x-media-api-key');
  }
}

async function handleAction(worker, action, payload) {
  switch (action) {
    case 'joinPeer': {
      requireActionFields(payload, ['roomId', 'peerId']);
      const room = await ensureRoom(payload.roomId, worker);
      ensurePeer(room, payload.peerId, payload.socketId);
      return {
        roomId: payload.roomId,
        peerId: payload.peerId,
        routerRtpCapabilities: room.router.rtpCapabilities,
        stats: roomStats(room),
      };
    }

    case 'leavePeer': {
      requireActionFields(payload, ['roomId', 'peerId']);
      const left = closePeer(payload.roomId, payload.peerId);
      return { roomId: payload.roomId, peerId: payload.peerId, left };
    }

    case 'disconnectPeer': {
      requireActionFields(payload, ['peerId']);
      const roomIds = Array.isArray(payload.roomIds) ? payload.roomIds : [];
      const disconnectedFrom = [];

      const targets = roomIds.length ? roomIds : [...rooms.keys()];
      for (const roomId of targets) {
        if (closePeer(roomId, payload.peerId)) {
          disconnectedFrom.push(roomId);
        }
      }

      return { peerId: payload.peerId, disconnectedFrom };
    }

    case 'getRouterRtpCapabilities': {
      requireActionFields(payload, ['roomId']);
      const room = await ensureRoom(payload.roomId, worker);
      if (payload.peerId) {
        ensurePeer(room, payload.peerId, payload.socketId);
      }
      return { roomId: payload.roomId, routerRtpCapabilities: room.router.rtpCapabilities };
    }

    case 'createWebRtcTransport': {
      requireActionFields(payload, ['roomId', 'peerId']);
      const room = await ensureRoom(payload.roomId, worker);
      const peer = ensurePeer(room, payload.peerId, payload.socketId);

      const transport = await room.router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: ANNOUNCED_IP }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        initialAvailableOutgoingBitrate: INITIAL_OUTGOING_BITRATE,
      });

      room.transports.set(transport.id, {
        transport,
        roomId: payload.roomId,
        peerId: payload.peerId,
        direction: payload.direction || 'send',
      });
      peer.transports.add(transport.id);

      transport.on('dtlsstatechange', (state) => {
        if (state === 'closed') {
          cleanupTransport(payload.roomId, transport.id, false);
        }
      });

      transport.on('close', () => {
        cleanupTransport(payload.roomId, transport.id, false);
      });

      return {
        transportId: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
        sctpParameters: transport.sctpParameters || null,
      };
    }

    case 'connectWebRtcTransport': {
      requireActionFields(payload, ['roomId', 'peerId', 'transportId', 'dtlsParameters']);
      const room = getRoomOrThrow(payload.roomId);
      const entry = getTransportEntry(room, payload.transportId, payload.peerId);
      await entry.transport.connect({ dtlsParameters: payload.dtlsParameters });
      return { connected: true, transportId: payload.transportId };
    }

    case 'produce': {
      requireActionFields(payload, ['roomId', 'peerId', 'transportId', 'kind', 'rtpParameters']);
      const room = getRoomOrThrow(payload.roomId);
      const transportEntry = getTransportEntry(room, payload.transportId, payload.peerId);
      const producer = await transportEntry.transport.produce({
        kind: payload.kind,
        rtpParameters: payload.rtpParameters,
        appData: payload.appData || {},
      });

      room.producers.set(producer.id, {
        producer,
        roomId: payload.roomId,
        peerId: payload.peerId,
        transportId: payload.transportId,
        kind: producer.kind,
      });

      const peer = ensurePeer(room, payload.peerId, payload.socketId);
      peer.producers.add(producer.id);

      producer.on('transportclose', () => {
        cleanupProducer(payload.roomId, producer.id, false);
      });

      producer.on('close', () => {
        cleanupProducer(payload.roomId, producer.id, false);
      });

      return { producerId: producer.id };
    }

    case 'consume': {
      requireActionFields(payload, ['roomId', 'peerId', 'transportId', 'producerId', 'rtpCapabilities']);
      const room = getRoomOrThrow(payload.roomId);
      const transportEntry = getTransportEntry(room, payload.transportId, payload.peerId);
      getProducerEntry(room, payload.producerId);

      if (!room.router.canConsume({ producerId: payload.producerId, rtpCapabilities: payload.rtpCapabilities })) {
        throw new HttpError(400, 'Cannot consume this producer with provided rtpCapabilities');
      }

      const consumer = await transportEntry.transport.consume({
        producerId: payload.producerId,
        rtpCapabilities: payload.rtpCapabilities,
        paused: true,
      });

      room.consumers.set(consumer.id, {
        consumer,
        roomId: payload.roomId,
        peerId: payload.peerId,
        transportId: payload.transportId,
        producerId: payload.producerId,
      });

      const peer = ensurePeer(room, payload.peerId, payload.socketId);
      peer.consumers.add(consumer.id);

      consumer.on('transportclose', () => {
        cleanupConsumer(payload.roomId, consumer.id, false);
      });

      consumer.on('producerclose', () => {
        cleanupConsumer(payload.roomId, consumer.id, false);
      });

      return {
        consumerId: consumer.id,
        producerId: payload.producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        type: consumer.type,
        producerPaused: consumer.producerPaused,
      };
    }

    case 'resumeConsumer': {
      requireActionFields(payload, ['roomId', 'peerId', 'consumerId']);
      const room = getRoomOrThrow(payload.roomId);
      const entry = getConsumerEntry(room, payload.consumerId, payload.peerId);
      await entry.consumer.resume();
      return {
        ok: true,
        consumerId: payload.consumerId,
        paused: entry.consumer.paused,
      };
    }

    case 'closeProducer': {
      requireActionFields(payload, ['roomId', 'peerId', 'producerId']);
      const room = getRoomOrThrow(payload.roomId);
      getProducerEntry(room, payload.producerId, payload.peerId);
      cleanupProducer(payload.roomId, payload.producerId, true);
      return { ok: true, producerId: payload.producerId };
    }

    case 'closeConsumer': {
      requireActionFields(payload, ['roomId', 'peerId', 'consumerId']);
      const room = getRoomOrThrow(payload.roomId);
      getConsumerEntry(room, payload.consumerId, payload.peerId);
      cleanupConsumer(payload.roomId, payload.consumerId, true);
      return { ok: true, consumerId: payload.consumerId };
    }

    case 'listProducers': {
      requireActionFields(payload, ['roomId']);
      const room = getRoomOrThrow(payload.roomId);
      const producerIds = [...room.producers.entries()]
        .filter(([, entry]) => (payload.peerId ? entry.peerId !== payload.peerId : true))
        .map(([producerId]) => producerId);
      return { roomId: payload.roomId, producerIds };
    }

    default:
      throw new HttpError(400, `Unknown action: ${action}`);
  }
}

async function startWorker() {
  const worker = await createWorker({
    logLevel: 'warn',
    rtcMinPort: RTC_MIN_PORT,
    rtcMaxPort: RTC_MAX_PORT,
  });

  worker.on('died', () => {
    console.error('Mediasoup worker died');
    process.exit(1);
  });

  console.log(`Mediasoup worker running with UDP ${RTC_MIN_PORT}-${RTC_MAX_PORT}`);

  const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url || '/', 'http://localhost');

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,x-media-api-key',
      });
      res.end();
      return;
    }

    if (req.method === 'GET' && requestUrl.pathname === '/health') {
      json(res, 200, {
        ok: true,
        workerPid: worker.pid,
        rooms: rooms.size,
      });
      return;
    }

    if (req.method === 'POST' && requestUrl.pathname === SIGNALING_ACTION_PATH) {
      try {
        authorizeRequest(req);
        const body = await parseJsonBody(req);
        const action = body?.action;
        const payload = body?.payload || {};

        if (!action) {
          throw new HttpError(400, 'action is required');
        }

        const result = await handleAction(worker, action, payload);
        json(res, 200, result);
      } catch (error) {
        const status = error.status || 500;
        json(res, status, { error: error.message || 'Internal server error' });
      }
      return;
    }

    json(res, 404, { error: 'Not found' });
  });

  server.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`Signaling server listening on port ${HTTP_PORT}`);
    console.log(`Signaling action path: ${SIGNALING_ACTION_PATH}`);
    if (ANNOUNCED_IP) {
      console.log(`Using announced IP: ${ANNOUNCED_IP}`);
    }
  });
}

startWorker().catch((err) => {
  console.error('❌ Failed to start Mediasoup worker:', err);
  process.exit(1);
});