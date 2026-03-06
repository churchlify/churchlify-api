// routes/chat.js
const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const router = express.Router();
router.use(express.json());
const { rooms, redisClient, mediaTopology } = require('../media-client');
const { getIO } = require('../config/socket');
const User = require('../models/user');
const ChatMessage = require('../models/chatMessage');
const CallSession = require('../models/callSession');

function isRedisReady() {
  return Boolean(redisClient && redisClient.status === 'ready');
}

function getIoSafe() {
  try {
    return getIO();
  } catch (_) {
    return null;
  }
}

async function resolveCurrentUser(req) {
  const firebaseUid = req.user?.uid;
  if (!firebaseUid) {
    return null;
  }

  return User.findOne({
    firebaseId: firebaseUid,
    church: req.church?._id,
  })
    .select('_id firstName lastName firebaseId church')
    .lean();
}

function uniqueObjectIdStrings(values = []) {
  const result = [];
  const seen = new Set();

  values.forEach((value) => {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      return;
    }
    const id = String(value);
    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    result.push(id);
  });

  return result;
}

function toObjectIds(values = []) {
  return values.map((id) => new mongoose.Types.ObjectId(id));
}

function serializeMessage(message) {
  return {
    id: message._id,
    roomId: message.roomId,
    messageType: message.messageType,
    text: message.text,
    metadata: message.metadata,
    participants: (message.participants || []).map((id) => id.toString()),
    sender: message.sender,
    readBy: (message.readBy || []).map((id) => id.toString()),
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  };
}

function serializeCall(call) {
  return {
    id: call._id,
    roomId: call.roomId,
    mediaType: call.mediaType,
    status: call.status,
    initiatedBy: call.initiatedBy,
    participants: (call.participants || []).map((id) => id.toString()),
    metadata: call.metadata,
    answeredBy: call.answeredBy,
    answeredAt: call.answeredAt,
    endedBy: call.endedBy,
    endedAt: call.endedAt,
    endReason: call.endReason,
    createdAt: call.createdAt,
    updatedAt: call.updatedAt,
  };
}

function isCallMember(call, userId) {
  const id = String(userId);
  if (String(call.initiatedBy) === id) {
    return true;
  }
  return (call.participants || []).some((participantId) => String(participantId) === id);
}

function normalizeHost(value) {
  if (!value) {return '';}
  return String(value)
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '');
}

function buildTurnCredentials() {
  const ttlSec = Number(process.env.TURN_USER_EXPIRY_SEC || 600);
  const turnHost = normalizeHost(process.env.TURN_URL || process.env.TURN_HOST || process.env.REMOTE_HOST);
  const secret = process.env.TURN_SHARED_SECRET || process.env.TURN_SECRET;

  if (!turnHost || !secret) {
    throw new Error('TURN_URL/TURN_HOST and TURN_SHARED_SECRET are required');
  }

  const unixExpiry = Math.floor(Date.now() / 1000) + ttlSec;
  const username = `${unixExpiry}:churchlify`;
  const credential = crypto
    .createHmac('sha1', secret)
    .update(username)
    .digest('base64');

  return {
    username,
    credential,
    ttlSec,
    urls: [
      `turn:${turnHost}:3478?transport=udp`,
      `turn:${turnHost}:3478?transport=tcp`,
      `turns:${turnHost}:5349?transport=tcp`,
    ],
  };
}

router.get('/webrtc/config', (req, res) => {
  const signalingBaseUrl = (process.env.MEDIASOUP_SIGNALING_BASE_URL || '').replace(/\/$/, '');
  const signalingActionPath = process.env.MEDIASOUP_SIGNALING_ACTION_PATH || '/v1/signaling/actions';
  let actionEndpoint = null;
  if (mediaTopology === 'external' && signalingBaseUrl) {
    actionEndpoint = `${signalingBaseUrl}${signalingActionPath}`;
  }

  res.json({
    topology: mediaTopology,
    signaling: {
      mode: mediaTopology === 'external' ? 'api-bridge' : 'embedded',
      actionEndpoint,
    },
  });
});

router.get('/turn-credentials', (req, res) => {
  try {
    res.json(buildTurnCredentials());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/rooms/:roomId/members', async (req, res) => {
  try {
    const { roomId } = req.params;
    if (!roomId) {
      return res.status(400).json({ error: 'roomId required' });
    }

    if (isRedisReady()) {
      const members = await redisClient.smembers(`room:${roomId}`);
      return res.json({ roomId, members: members.filter((id) => id !== '__room__') });
    }

    return res.json({ roomId, members: Array.from(rooms.get(roomId) || []) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/messages', async (req, res) => {
  try {
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ error: 'Unable to resolve authenticated user profile' });
    }

    const {
      roomId,
      text,
      participants = [],
      messageType = 'text',
      metadata,
    } = req.body;

    if (!roomId) {
      return res.status(400).json({ error: 'roomId required' });
    }

    if (messageType === 'text' && (!text || !String(text).trim())) {
      return res.status(400).json({ error: 'text required for text messages' });
    }

    const participantIds = uniqueObjectIdStrings([...participants, currentUser._id]);
    const message = await ChatMessage.create({
      church: req.church._id,
      roomId,
      sender: currentUser._id,
      participants: toObjectIds(participantIds),
      messageType,
      text,
      metadata,
      readBy: [currentUser._id],
    });

    await message.populate('sender', 'firstName lastName firebaseId photoUrl');
    const payload = serializeMessage(message);

    const io = getIoSafe();
    if (io) {
      io.to(roomId).emit('chat:message:new', payload);
    }

    return res.status(201).json({ message: payload });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/messages', async (req, res) => {
  try {
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ error: 'Unable to resolve authenticated user profile' });
    }

    const { roomId, before } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);

    if (!roomId) {
      return res.status(400).json({ error: 'roomId required' });
    }

    const filter = {
      church: req.church._id,
      roomId,
      participants: currentUser._id,
    };

    if (before) {
      const beforeDate = new Date(before);
      if (!Number.isNaN(beforeDate.getTime())) {
        filter.createdAt = { $lt: beforeDate };
      }
    }

    const records = await ChatMessage.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('sender', 'firstName lastName firebaseId photoUrl')
      .lean();

    const messages = records.reverse().map((record) => serializeMessage(record));
    return res.json({
      messages,
      pagination: {
        limit,
        returned: records.length,
        hasMore: records.length === limit,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.patch('/messages/:id/read', async (req, res) => {
  try {
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ error: 'Unable to resolve authenticated user profile' });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid message id' });
    }

    const message = await ChatMessage.findOneAndUpdate(
      { _id: id, church: req.church._id, participants: currentUser._id },
      { $addToSet: { readBy: currentUser._id } },
      { new: true }
    ).lean();

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const io = getIoSafe();
    if (io) {
      io.to(message.roomId).emit('chat:message:read', {
        messageId: message._id,
        roomId: message.roomId,
        userId: currentUser._id,
        readAt: new Date().toISOString(),
      });
    }

    return res.json({
      id: message._id,
      roomId: message.roomId,
      readBy: (message.readBy || []).map((userId) => userId.toString()),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/calls/start', async (req, res) => {
  try {
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ error: 'Unable to resolve authenticated user profile' });
    }

    const {
      roomId,
      participants = [],
      mediaType = 'voice',
      metadata,
    } = req.body;

    if (!roomId) {
      return res.status(400).json({ error: 'roomId required' });
    }

    if (!['voice', 'video'].includes(mediaType)) {
      return res.status(400).json({ error: 'mediaType must be voice or video' });
    }

    const participantIds = uniqueObjectIdStrings([...participants, currentUser._id]);
    const call = await CallSession.create({
      church: req.church._id,
      roomId,
      initiatedBy: currentUser._id,
      participants: toObjectIds(participantIds),
      mediaType,
      status: 'ringing',
      metadata,
    });

    await call.populate('initiatedBy', 'firstName lastName firebaseId photoUrl');
    const payload = serializeCall(call);
    const io = getIoSafe();
    if (io) {
      io.to(roomId).emit('call:ringing', payload);
    }

    return res.status(201).json({ call: payload });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/calls/:id/accept', async (req, res) => {
  try {
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ error: 'Unable to resolve authenticated user profile' });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid call id' });
    }

    const call = await CallSession.findOne({ _id: id, church: req.church._id });
    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }
    if (!isCallMember(call, currentUser._id)) {
      return res.status(403).json({ error: 'You are not a participant in this call' });
    }
    if (call.status !== 'ringing') {
      return res.status(409).json({ error: `Call cannot be accepted in status ${call.status}` });
    }

    const participantIds = uniqueObjectIdStrings([...call.participants, currentUser._id]);
    call.participants = toObjectIds(participantIds);
    call.status = 'active';
    call.answeredBy = currentUser._id;
    call.answeredAt = new Date();
    await call.save();

    await call.populate('initiatedBy', 'firstName lastName firebaseId photoUrl');
    await call.populate('answeredBy', 'firstName lastName firebaseId photoUrl');

    const payload = serializeCall(call);
    const io = getIoSafe();
    if (io) {
      io.to(call.roomId).emit('call:accepted', payload);
    }

    return res.json({ call: payload });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/calls/:id/reject', async (req, res) => {
  try {
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ error: 'Unable to resolve authenticated user profile' });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid call id' });
    }

    const call = await CallSession.findOne({ _id: id, church: req.church._id });
    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }
    if (!isCallMember(call, currentUser._id)) {
      return res.status(403).json({ error: 'You are not a participant in this call' });
    }
    if (call.status !== 'ringing') {
      return res.status(409).json({ error: `Call cannot be rejected in status ${call.status}` });
    }

    call.status = 'rejected';
    call.endedBy = currentUser._id;
    call.endedAt = new Date();
    call.endReason = req.body?.reason || 'rejected';
    await call.save();

    await call.populate('initiatedBy', 'firstName lastName firebaseId photoUrl');
    await call.populate('endedBy', 'firstName lastName firebaseId photoUrl');

    const payload = serializeCall(call);
    const io = getIoSafe();
    if (io) {
      io.to(call.roomId).emit('call:rejected', payload);
    }

    return res.json({ call: payload });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/calls/:id/end', async (req, res) => {
  try {
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ error: 'Unable to resolve authenticated user profile' });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid call id' });
    }

    const call = await CallSession.findOne({ _id: id, church: req.church._id });
    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }
    if (!isCallMember(call, currentUser._id)) {
      return res.status(403).json({ error: 'You are not a participant in this call' });
    }
    if (!['ringing', 'active'].includes(call.status)) {
      return res.status(409).json({ error: `Call cannot be ended in status ${call.status}` });
    }

    call.status = call.status === 'ringing' ? 'cancelled' : 'ended';
    call.endedBy = currentUser._id;
    call.endedAt = new Date();
    call.endReason = req.body?.reason || 'ended';
    await call.save();

    await call.populate('initiatedBy', 'firstName lastName firebaseId photoUrl');
    await call.populate('endedBy', 'firstName lastName firebaseId photoUrl');

    const payload = serializeCall(call);
    const io = getIoSafe();
    if (io) {
      io.to(call.roomId).emit('call:ended', payload);
    }

    return res.json({ call: payload });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/calls/history', async (req, res) => {
  try {
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ error: 'Unable to resolve authenticated user profile' });
    }

    const { roomId, status } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const skip = parseInt(req.query.skip, 10) || 0;

    const filter = {
      church: req.church._id,
      $or: [
        { initiatedBy: currentUser._id },
        { participants: currentUser._id },
      ],
    };

    if (roomId) {
      filter.roomId = roomId;
    }
    if (status) {
      filter.status = status;
    }

    const records = await CallSession.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate('initiatedBy', 'firstName lastName firebaseId photoUrl')
      .populate('answeredBy', 'firstName lastName firebaseId photoUrl')
      .populate('endedBy', 'firstName lastName firebaseId photoUrl')
      .lean();

    return res.json({
      calls: records.map((call) => serializeCall(call)),
      pagination: {
        limit,
        skip,
        returned: records.length,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});


router.post('/rooms', async (req, res) => {
  const { roomId } = req.body;
  if (!roomId) {return res.status(400).json({ error: 'roomId required' });}
  
  if (isRedisReady()) {
    // Create room and set 1-hour TTL; auto-expires if not refreshed
    await redisClient.sadd(`room:${roomId}`, '__room__');
    await redisClient.expire(`room:${roomId}`, 3600);
    await redisClient.srem(`room:${roomId}`, '__room__');
  } else if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  res.json({ roomId, status: 'created' });
});


router.post('/rooms/join', async (req, res) => {
  const currentUser = await resolveCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'Unable to resolve authenticated user profile' });
  }

  const { roomId, userId } = req.body;
  const memberId = userId || String(currentUser._id);
  if (!roomId || !memberId) {return res.status(400).json({ error: 'roomId and userId required' });}

  if (isRedisReady()){
    await redisClient.sadd(`room:${roomId}`, memberId);
    await redisClient.expire(`room:${roomId}`, 3600);
  }else {
    if (!rooms.has(roomId)){ rooms.set(roomId, new Set());}
    rooms.get(roomId).add(memberId);
  }

  const io = getIoSafe();
  if (io) {
    io.to(roomId).emit('userJoined', { userId: memberId, roomId });
  }

  res.json({ roomId, userId: memberId, status: 'joined' });
});
module.exports = router;