// routes/chat.js
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { rooms, redisClient } = require('../media-client');
// TURN credentials endpoint

/*#swagger.tags = ['Chat']
#swagger.description = "GET /turn-credentials"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Chat" } }*/
router.get('/turn-credentials', (req, res) => {
  const username = Math.floor(Date.now() / 1000) + 600; // valid for 10 min
  const credential = crypto
    .createHmac('sha1', process.env.TURN_SHARED_SECRET)
    .update(username.toString())
    .digest('base64');
  res.json({
    username,
    credential,
    urls: [
      `turn:${process.env.TURN_URL}:3478?transport=udp`,
      `turn:${process.env.TURN_URL}:3478?transport=tcp`,
      `turns:${process.env.TURN_URL}:5349?transport=tcp`,
    ],
  });
});
// Create room

/*#swagger.tags = ['Chat']
#swagger.description = "POST /rooms"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Chat" } }*/
router.post('/rooms', async (req, res) => {
  const { roomId } = req.body;
  if (!roomId) {return res.status(400).json({ error: 'roomId required' });}
  if (redisClient) {await redisClient.del(`room:${roomId}`);}
  else if (!rooms.has(roomId)){ rooms.set(roomId, new Set());}
  res.json({ roomId, status: 'created' });
});
// Join room (optional, handled by WebSocket)

/*#swagger.tags = ['Chat']
#swagger.description = "POST /rooms/join"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Chat" } }*/
router.post('/rooms/join', async (req, res) => {
  const { roomId, userId } = req.body;
  if (!roomId || !userId) {return res.status(400).json({ error: 'roomId and userId required' });}
  if (redisClient){ 
    await redisClient.sadd(`room:${roomId}`, userId);
  }else {
    if (!rooms.has(roomId)){ rooms.set(roomId, new Set());}
    rooms.get(roomId).add(userId);
  }
  res.json({ roomId, userId, status: 'joined' });
});
module.exports = router;