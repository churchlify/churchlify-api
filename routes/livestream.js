const express = require('express');
const router = express.Router();
const { https } = require('follow-redirects');
const Settings = require('../models/settings');
const { get, set } = require('../common/cache');
const logger = require('../logger/logger');
const CACHE_TTL = 60;
const axios = require('axios'); // Recommended for API calls

async function checkYouTubeAPI(channelId, apiKey) {
  if (!apiKey) {return null;}

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&eventType=live&key=${apiKey}`;
    const response = await axios.get(url);
    
    const liveVideo = response.data.items[0];
    if (liveVideo) {
      return { 
        live: true, 
        videoId: liveVideo.id.videoId, 
        title: liveVideo.snippet.title,
        source: 'youtube-api' 
      };
    }
  } catch (err) {
    logger.error('YouTube API call failed', err.response?.data || err.message);
  }
  return null;
}

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

async function detectLiveStream(channelId, churchId, apiKey) {
  if (!isValidChannelId(channelId)) {
    return { live: false, error: 'Invalid channel ID' };
  }

  const cacheKey = `live:${channelId}`;
  const cached = await get(churchId, cacheKey);
  if (cached) {return cached;}

  let result = await checkYouTubeAPI(channelId, apiKey);

 if (!result || !result.live) {
    logger.info(`API found no live stream for ${channelId}, trying scraper...`);
    result = await checkYouTubeEndpoints(channelId);
  }
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
    
    const api_key = await Settings.findOne({ church: churchId, key: 'youtube_api_key' }).lean();
    const YOUTUBE_API_KEY = api_key?.value || process.env.YOUTUBE_API_KEY;  

    const response = await detectLiveStream(setting.value, churchId, YOUTUBE_API_KEY );
    res.json(response);
  } catch (error) {
    logger.error('Livestream feed error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;