const express = require('express');
const Settings = require('../models/settings');
const axios = require('axios');
const router = express.Router();

router.get('/feed', async(req, res) => {
    const church = req.church._id;
    const setting = await Settings.findOne({church, key: 'channel'});
    const channelId =  setting.value;
    if (!setting) {return res.status(400).json({ message: `Livestream settings for church  ${church} not found` });}
    const apiKey = process.env.YOUTUBE_API_KEY;

  try {
    const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        part: 'snippet',
        channelId,
        eventType: 'live',
        type: 'video',
        key: apiKey,
      },
    });
    

    res.json(response.data);
  } catch (error) {
    console.error('YouTube API error:', error.message);
    res.status(500).json({ error: 'Failed to fetch livestream' });
  }
});

module.exports = router;