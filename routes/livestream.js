const express = require('express');
const router = express.Router();
const { https } = require('follow-redirects');
const Settings = require('../models/settings');
const { get, set } = require('../common/cache');
const logger = require('../logger/logger');

const CACHE_TTL = 60;

// Helper to handle async redirect tracking
function getFinalUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => resolve(res.responseUrl)).on('error', reject);
  });
}

function isValidChannelId(channelId) {
  return /^UC[a-zA-Z0-9_-]{22}$/.test(channelId);
}

function extractVideoId(url) {
  if (!url || !url.includes('watch?v=')) {return null;}
  const urlObj = new URL(url);
  return urlObj.searchParams.get('v');
}

async function checkYouTubeEndpoints(channelId) {
  const endpoints = [
    { url: `https://www.youtube.com/channel/${channelId}/live`, source: 'live-endpoint' },
    { url: `https://www.youtube.com/embed/live_stream?channel=${channelId}`, source: 'embed-endpoint' }
  ];

  for (const endpoint of endpoints) {
    try {
      const finalUrl = await getFinalUrl(endpoint.url);
      const videoId = extractVideoId(finalUrl);

      if (videoId) {
        return { live: true, videoId, source: endpoint.source };
      }
    } catch (err) {
      logger.error(`Error checking ${endpoint.source}`, err);
    }
  }

  return { live: false };
}

async function detectLiveStream(channelId, churchId) {
  if (!isValidChannelId(channelId)) {
    return { live: false, error: 'Invalid channel ID' };
  }

  const cacheKey = `live:${channelId}`;
  const cached = await get(churchId, cacheKey);
  if (cached) {return cached;}

  const result = await checkYouTubeEndpoints(channelId);
  await set(churchId, cacheKey, result, CACHE_TTL);
  
  return result;
}

router.get('/feed', async (req, res) => {
  try {
    const churchId = req.church._id;
    const setting = await Settings.findOne({ church: churchId, key: 'channel' }).lean();
    
    if (!setting?.value) {
      return res.status(404).json({ error: 'YouTube channel setting not found' });
    }

    const response = await detectLiveStream(setting.value, churchId);
    res.json(response);
  } catch (error) {
    logger.error('Livestream feed error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;