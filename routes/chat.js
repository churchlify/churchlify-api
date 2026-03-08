// routes/chat.js
const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const multer = require('multer');
const router = express.Router();
router.use(express.json());
const { rooms, redisClient, mediaTopology } = require('../media-client');
const { getIO } = require('../config/socket');
const { uploadToMinio } = require('../common/upload');
const User = require('../models/user');
const ChatMessage = require('../models/chatMessage');
const CallSession = require('../models/callSession');
const Ministry = require('../models/ministry');
const Fellowship = require('../models/fellowship');

const DEFAULT_ROOM_SETTINGS = Object.freeze({
  chatEnabled: true,
  callsEnabled: true,
  moderatedBy: null,
  updatedAt: null,
});
const ALLOWED_MESSAGE_TYPES = ['text', 'system', 'announcement', 'attachment', 'voice_note'];
const CHAT_TYPING_TTL_SEC = Number(process.env.CHAT_TYPING_TTL_SEC || 6);
const CHAT_UPLOAD_MAX_BYTES = Number(process.env.CHAT_UPLOAD_MAX_BYTES || 10 * 1024 * 1024);
const ALLOWED_CHAT_UPLOAD_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
  'video/mp4',
  'video/webm',
]);
const roomSettingsCache = new Map();
const typingStateCache = new Map();

const chatUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CHAT_UPLOAD_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_CHAT_UPLOAD_MIME_TYPES.has(file.mimetype)) {
      return cb(null, true);
    }
    return cb(new Error('Unsupported chat file type'));
  },
}).single('file');

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
    .select('_id firstName lastName firebaseId church role')
    .lean();
}

function parseGroupRoomId(roomId) {
  const parts = String(roomId || '').split(':');
  if (parts.length !== 3 || parts[0] !== 'group') {
    return null;
  }

  const groupType = parts[1];
  const groupId = parts[2];
  if (!['ministry', 'fellowship'].includes(groupType)) {
    return null;
  }
  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return null;
  }

  return { groupType, groupId };
}

function buildRoomSettingsKey(roomId) {
  return `room:settings:${roomId}`;
}

function sanitizeRoomSettings(value = {}) {
  return {
    chatEnabled: typeof value.chatEnabled === 'boolean' ? value.chatEnabled : true,
    callsEnabled: typeof value.callsEnabled === 'boolean' ? value.callsEnabled : true,
    moderatedBy: value.moderatedBy ? String(value.moderatedBy) : null,
    updatedAt: value.updatedAt || null,
  };
}

async function getRoomSettings(roomId) {
  if (!roomId) {
    return { ...DEFAULT_ROOM_SETTINGS };
  }

  if (isRedisReady()) {
    const raw = await redisClient.get(buildRoomSettingsKey(roomId));
    if (!raw) {
      return { ...DEFAULT_ROOM_SETTINGS };
    }

    try {
      return sanitizeRoomSettings(JSON.parse(raw));
    } catch (_) {
      return { ...DEFAULT_ROOM_SETTINGS };
    }
  }

  return sanitizeRoomSettings(roomSettingsCache.get(roomId) || DEFAULT_ROOM_SETTINGS);
}

async function saveRoomSettings(roomId, settings) {
  const normalized = sanitizeRoomSettings(settings);
  if (isRedisReady()) {
    await redisClient.set(buildRoomSettingsKey(roomId), JSON.stringify(normalized));
    return normalized;
  }

  roomSettingsCache.set(roomId, normalized);
  return normalized;
}

function resolveModerationPatchPayload(body = {}) {
  if (body && typeof body === 'object') {
    if (body.moderation && typeof body.moderation === 'object') {
      return body.moderation;
    }

    if (body.settings && typeof body.settings === 'object') {
      return body.settings;
    }
  }

  return body;
}

function runSingleUpload(uploader, req, res) {
  return new Promise((resolve, reject) => {
    uploader(req, res, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function buildTypingKey(roomId) {
  return `room:typing:${roomId}`;
}

function upsertTypingStateMemory(roomId, userId, expiresAtMs) {
  if (!typingStateCache.has(roomId)) {
    typingStateCache.set(roomId, new Map());
  }
  typingStateCache.get(roomId).set(String(userId), expiresAtMs);
}

function removeTypingStateMemory(roomId, userId) {
  if (!typingStateCache.has(roomId)) {
    return;
  }

  const roomState = typingStateCache.get(roomId);
  roomState.delete(String(userId));
  if (roomState.size === 0) {
    typingStateCache.delete(roomId);
  }
}

function pruneTypingStateMemory(roomId) {
  if (!typingStateCache.has(roomId)) {
    return [];
  }

  const now = Date.now();
  const roomState = typingStateCache.get(roomId);
  const active = [];

  roomState.forEach((expiresAtMs, userId) => {
    if (expiresAtMs > now) {
      active.push(userId);
      return;
    }
    roomState.delete(userId);
  });

  if (roomState.size === 0) {
    typingStateCache.delete(roomId);
  }

  return active;
}

async function setTypingState(roomId, userId, isTyping) {
  const normalizedUserId = String(userId);
  const now = Date.now();

  if (isRedisReady()) {
    const key = buildTypingKey(roomId);
    await redisClient.zremrangebyscore(key, '-inf', now);

    if (isTyping) {
      const expiresAtMs = now + CHAT_TYPING_TTL_SEC * 1000;
      await redisClient.zadd(key, expiresAtMs, normalizedUserId);
      await redisClient.expire(key, CHAT_TYPING_TTL_SEC + 5);
      return;
    }

    await redisClient.zrem(key, normalizedUserId);
    return;
  }

  if (isTyping) {
    upsertTypingStateMemory(roomId, normalizedUserId, now + CHAT_TYPING_TTL_SEC * 1000);
    return;
  }

  removeTypingStateMemory(roomId, normalizedUserId);
}

async function getTypingMembers(roomId) {
  const now = Date.now();

  if (isRedisReady()) {
    const key = buildTypingKey(roomId);
    await redisClient.zremrangebyscore(key, '-inf', now);
    const members = await redisClient.zrangebyscore(key, now, '+inf');
    return (members || []).map((id) => String(id));
  }

  return pruneTypingStateMemory(roomId);
}

function hasNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isAttachmentMetadataValid(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return false;
  }

  return hasNonEmptyString(metadata.fileUrl);
}

function isVoiceNoteMetadataValid(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return false;
  }

  if (!hasNonEmptyString(metadata.fileUrl)) {
    return false;
  }

  if (metadata.durationSec !== undefined) {
    return Number.isFinite(metadata.durationSec) && Number(metadata.durationSec) >= 0;
  }

  return true;
}

async function canModerateRoom(currentUser, churchId, roomId) {
  if (!currentUser) {
    return false;
  }

  if (['super', 'admin'].includes(currentUser.role)) {
    return true;
  }

  const parsed = parseGroupRoomId(roomId);
  if (!parsed) {
    return false;
  }

  if (parsed.groupType === 'ministry') {
    const ministry = await Ministry.findOne({
      _id: parsed.groupId,
      church: churchId,
    })
      .select('leaderId')
      .lean();
    return Boolean(ministry && String(ministry.leaderId) === String(currentUser._id));
  }

  const fellowship = await Fellowship.findOne({
    _id: parsed.groupId,
    church: churchId,
  })
    .select('leaderId')
    .lean();
  return Boolean(fellowship && String(fellowship.leaderId) === String(currentUser._id));
}

async function handleModerationPatch(req, res) {
  const currentUser = await resolveCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'Unable to resolve authenticated user profile' });
  }

  const { roomId } = req.params;
  if (!roomId) {
    return res.status(400).json({ error: 'roomId required' });
  }

  const allowed = await canModerateRoom(currentUser, req.church._id, roomId);
  if (!allowed) {
    return res.status(403).json({ error: 'Only leaders/admins can moderate this room' });
  }

  const payload = resolveModerationPatchPayload(req.body || {});
  const currentSettings = await getRoomSettings(roomId);
  const hasChatFlag = Object.prototype.hasOwnProperty.call(payload, 'chatEnabled');
  const hasCallsFlag = Object.prototype.hasOwnProperty.call(payload, 'callsEnabled');

  if (!hasChatFlag && !hasCallsFlag) {
    return res.status(400).json({ error: 'chatEnabled or callsEnabled required' });
  }

  const nextSettings = {
    chatEnabled: hasChatFlag ? Boolean(payload.chatEnabled) : currentSettings.chatEnabled,
    callsEnabled: hasCallsFlag ? Boolean(payload.callsEnabled) : currentSettings.callsEnabled,
    moderatedBy: String(currentUser._id),
    updatedAt: new Date().toISOString(),
  };

  const saved = await saveRoomSettings(roomId, nextSettings);
  const io = getIoSafe();
  if (io) {
    io.to(roomId).emit('chat:room:moderation', {
      roomId,
      settings: saved,
    });
  }

  return res.json({ roomId, settings: saved });
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

/**
 * GET /chat/webrtc/config
 * Purpose: Returns signaling configuration for the current media topology.
 * Basic usage: GET /chat/webrtc/config
 */
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

/**
 * GET /chat/turn-credentials
 * Purpose: Returns temporary TURN credentials for WebRTC ICE negotiation.
 * Basic usage: GET /chat/turn-credentials
 */
router.get('/turn-credentials', (req, res) => {
  try {
    res.json(buildTurnCredentials());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /chat/rooms/:roomId/members
 * Purpose: Lists active member IDs in a room (from Redis or in-memory fallback).
 * Basic usage: GET /chat/rooms/group:fellowship:69ab635ed10f494f98eba7d2/members
 */
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

/**
 * GET /chat/rooms/:roomId/settings
 * Purpose: Returns room moderation settings.
 */
router.get('/rooms/:roomId/settings', async (req, res) => {
  try {
    const { roomId } = req.params;
    if (!roomId) {
      return res.status(400).json({ error: 'roomId required' });
    }

    const settings = await getRoomSettings(roomId);
    return res.json({ roomId, settings });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /chat/rooms/:roomId
 * Purpose: Alias for room settings lookup.
 */
router.get('/rooms/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    if (!roomId) {
      return res.status(400).json({ error: 'roomId required' });
    }

    const settings = await getRoomSettings(roomId);
    return res.json({ roomId, settings });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /chat/rooms/:roomId/moderation
 * Purpose: Updates moderation settings for leaders/admins.
 */
router.patch('/rooms/:roomId/moderation', async (req, res) => {
  try {
    return handleModerationPatch(req, res);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /chat/rooms/:roomId
 * Purpose: Backward-compatible alias for moderation updates.
 */
router.patch('/rooms/:roomId', async (req, res) => {
  try {
    return handleModerationPatch(req, res);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /chat/messages/upload
 * Purpose: Uploads an attachment or voice note file and returns metadata for message creation.
 * Multipart field: file
 */
router.post('/messages/upload', async (req, res) => {
  const currentUser = await resolveCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'Unable to resolve authenticated user profile' });
  }

  try {
    await runSingleUpload(chatUpload, req, res);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Unable to upload file' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Use multipart field "file".' });
  }

  try {
    const fileUrl = await uploadToMinio(req.file);
    return res.status(201).json({
      fileUrl,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      uploadedBy: String(currentUser._id),
      uploadedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to persist uploaded file' });
  }
});

/**
 * POST /chat/rooms/:roomId/typing
 * Purpose: Sets typing state for current user and emits chat:typing event.
 */
router.post('/rooms/:roomId/typing', async (req, res) => {
  try {
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ error: 'Unable to resolve authenticated user profile' });
    }

    const { roomId } = req.params;
    if (!roomId) {
      return res.status(400).json({ error: 'roomId required' });
    }

    const isTyping = Boolean(req.body?.isTyping);
    await setTypingState(roomId, currentUser._id, isTyping);

    const payload = {
      roomId,
      userId: String(currentUser._id),
      isTyping,
      at: new Date().toISOString(),
    };

    const io = getIoSafe();
    if (io) {
      io.to(roomId).emit('chat:typing', payload);
    }

    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /chat/rooms/:roomId/typing
 * Purpose: Returns active typers for a room.
 */
router.get('/rooms/:roomId/typing', async (req, res) => {
  try {
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ error: 'Unable to resolve authenticated user profile' });
    }

    const { roomId } = req.params;
    if (!roomId) {
      return res.status(400).json({ error: 'roomId required' });
    }

    const includeSelf = String(req.query.includeSelf || 'false') === 'true';
    let typing = await getTypingMembers(roomId);
    if (!includeSelf) {
      typing = typing.filter((userId) => userId !== String(currentUser._id));
    }

    return res.json({
      roomId,
      typing,
      at: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /chat/messages
 * Purpose: Creates and broadcasts a chat message to a room.
 * Basic usage:
 * {
 *   "roomId": "group:fellowship:69ab635ed10f494f98eba7d2",
 *   "text": "hello",
 *   "participants": ["69a7ed1d917c61e08cb62ad9"],
 *   "messageType": "text",
 *   "metadata": { "groupType": "fellowship" }
 * }
 */
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

    if (!ALLOWED_MESSAGE_TYPES.includes(messageType)) {
      return res.status(400).json({ error: `messageType must be one of: ${ALLOWED_MESSAGE_TYPES.join(', ')}` });
    }

    const roomSettings = await getRoomSettings(roomId);
    if (!roomSettings.chatEnabled) {
      return res.status(403).json({ error: 'Chat is currently disabled for this room' });
    }

    if (messageType === 'text' && (!text || !String(text).trim())) {
      return res.status(400).json({ error: 'text required for text messages' });
    }

    if (messageType === 'attachment' && !isAttachmentMetadataValid(metadata)) {
      return res.status(400).json({ error: 'attachment messages require metadata.fileUrl' });
    }

    if (messageType === 'voice_note' && !isVoiceNoteMetadataValid(metadata)) {
      return res.status(400).json({ error: 'voice_note messages require metadata.fileUrl and optional numeric durationSec' });
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

/**
 * GET /chat/messages
 * Purpose: Retrieves room messages visible to the current user with cursor pagination.
 * Query params: roomId (required), limit (optional), before (optional ISO date).
 * Basic usage: GET /chat/messages?roomId=group:fellowship:69ab635ed10f494f98eba7d2&limit=30
 */
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

/**
 * PATCH /chat/messages/:id/read
 * Purpose: Marks a message as read for the authenticated user.
 * Basic usage: PATCH /chat/messages/66f1b4a91f0a8f0e5edfd0a1/read
 */
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

/**
 * POST /chat/calls/start
 * Purpose: Starts a call session and notifies room members.
 * Basic usage:
 * {
 *   "roomId": "group:ministry:69ab62e5e59978eb6cbb62f8",
 *   "participants": ["69a7ed1d917c61e08cb62ad9"],
 *   "mediaType": "voice",
 *   "metadata": { "source": "chat" }
 * }
 */
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

    const roomSettings = await getRoomSettings(roomId);
    if (!roomSettings.callsEnabled) {
      return res.status(403).json({ error: 'Calls are currently disabled for this room' });
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

/**
 * POST /chat/calls/:id/accept
 * Purpose: Accepts a ringing call and transitions it to active.
 * Basic usage: POST /chat/calls/66f1b4a91f0a8f0e5edfd0a1/accept
 */
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

/**
 * POST /chat/calls/:id/reject
 * Purpose: Rejects a ringing call and records the rejection reason.
 * Basic usage:
 * {
 *   "reason": "busy"
 * }
 */
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

/**
 * POST /chat/calls/:id/end
 * Purpose: Ends an active call, or cancels a ringing call.
 * Basic usage:
 * {
 *   "reason": "user_left"
 * }
 */
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

/**
 * GET /chat/calls/history
 * Purpose: Returns paginated call history for the current user.
 * Query params: roomId (optional), status (optional), limit (optional), skip (optional).
 * Basic usage: GET /chat/calls/history?roomId=group:ministry:69ab62e5e59978eb6cbb62f8&limit=20&skip=0
 */
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


/**
 * POST /chat/rooms
 * Purpose: Creates a room record for presence tracking.
 * Basic usage:
 * {
 *   "roomId": "group:fellowship:69ab635ed10f494f98eba7d2"
 * }
 */
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


/**
 * POST /chat/rooms/join
 * Purpose: Adds a user to a room membership list and broadcasts join event.
 * Basic usage:
 * {
 *   "roomId": "group:fellowship:69ab635ed10f494f98eba7d2",
 *   "userId": "69a7ed1d917c61e08cb62ad9"
 * }
 */
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