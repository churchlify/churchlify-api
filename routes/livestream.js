const express = require('express');
const Settings = require('../models/settings');
const router = express.Router();
const followRedirects = require('follow-redirects');
const { get, set } = require('../common/cache');
const logger = require('../logger/logger');

const { https } = followRedirects;
const CACHE_TTL = 60; // Cache for 60 seconds

function isValidChannelId(channelId) {
  // Basic validation for YouTube channel ID (starts with UC, typically 24 chars)
  return /^UC[a-zA-Z0-9_-]{22}$/.test(channelId);
}

async function checkYouTubeEndpoints(channelId) {
  const liveUrl = `https://www.youtube.com/channel/${channelId}/live`;
  const embedUrl = `https://www.youtube.com/embed/live_stream?channel=${channelId}`;

  // 1. Check /live endpoint
  try {
    const res = await https.get(liveUrl);
    const finalUrl = res.responseUrl;

    if (finalUrl.includes('watch?v=')) {
      const videoId = finalUrl.split('v=')[1].split('&')[0];
      return { live: true, videoId, source: 'live-endpoint' };
    }
  } catch (err) {
    logger.error('Error checking /live endpoint', err);
  }

  // 2. Check embed/live_stream
  try {
    const res = await https.get(embedUrl);
    const finalUrl = res.responseUrl;

    if (finalUrl.includes('watch?v=')) {
      const videoId = finalUrl.split('v=')[1].split('&')[0];
      return { live: true, videoId, source: 'embed-endpoint' };
    }
  } catch (err) {
    logger.error('Error checking embed endpoint', err);
  }

  return { live: false };
}

async function detectLiveStream(channelId, churchId) {
  if (!isValidChannelId(channelId)) {
    logger.warn(`Invalid channel ID for church ${churchId}`);
    return { live: false, error: 'Invalid channel ID' };
  }

  const cacheKey = `live:${channelId}`;
  const cached = await get(churchId, cacheKey);

  if (cached) {
    logger.info(`Cache hit for ${channelId}`);
    return cached;
  }

  logger.info(`Cache miss for ${channelId}, checking YouTube`);

  try {
    const result = await checkYouTubeEndpoints(channelId);

    await set(churchId, cacheKey, result, CACHE_TTL);

    return result;
  } catch (err) {
    logger.error(`Livestream detection failed for church ${churchId}`, err);
    return { live: false, error: 'Detection failed' };
  }
}

router.get('/feed', async(req, res) => {
    const church = req.church._id;
    const setting = await Settings.findOne({church, key: 'channel'}).select('value').lean();
    if (!setting) {return res.status(400).json({ message: `Livestream settings for church ${church} not found` });}
    const channelId = setting.value;
    // const apiKey = process.env.YOUTUBE_API_KEY;

  try {
    const response = await detectLiveStream(channelId, church);
    res.json(response);
  } catch (error) {
    logger.error('Livestream feed error:', error);
    res.status(500).json({ error: 'Failed to fetch livestream' });
  }
});

module.exports = router;