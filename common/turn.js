import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

export function generateTurnCredentials(ttlSec = 600) {
  const secret = process.env.TURN_SHARED_SECRET;
  const unixTime = Math.floor(Date.now() / 1000) + ttlSec;
  const username = `${unixTime}:user`;
  const hmac = crypto.createHmac('sha1', secret).update(username).digest('base64');

  return {
    urls: [
      `turn:${process.env.TURN_URL}:3478?transport=udp`,
      `turn:${process.env.TURN_URL}:3478?transport=tcp`,
    ],
    username,
    credential: hmac,
  };
}
