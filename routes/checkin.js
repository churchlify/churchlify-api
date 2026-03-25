// routes/checkin.routes.js
const express = require('express');
const router = express.Router();

const { authenticateFirebaseToken } = require('../middlewares/auth');
const attachUser = require('../middlewares/attachUser');

const checkinService = require('../services/checkin.service');

router.use(express.json());
router.use(authenticateFirebaseToken, attachUser);

// Get current active event
router.get('/current-event', async (req, res) => {
  try {
    console.log('Fetching active event for user:', req.currentUser._id);
    const event = await checkinService.getActiveEvent(req.currentUser);

    if (!event) {
      return res.json({ hasActiveEvent: false });
    }

    res.json({ hasActiveEvent: true, event });
  } catch (err) {
    res.status(500).json({ error: `Internal server error- ${err.message}`  });
  }
});

// Active check-in
router.get('/active', async (req, res) => {
  try {
    const result = await checkinService.getActiveCheckIn(req.currentUser);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: `Internal server error - ${err.message}` });
  }
});

// Initiate check-in
router.post('/initiate', async (req, res) => {
  try {
    console.log('Initiating check-in for user:', req.currentUser._id, 'with data:', req.body);
    const result = await checkinService.initiateCheckIn(req.currentUser, req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Confirm drop-off
router.patch('/:id/confirm-dropoff', async (req, res) => {
  try {
    const result = await checkinService.confirmDropoff(
      req.currentUser,
      req.params.id,
      req.body.childIds
    );
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Pickup
router.patch('/:id/pickup', async (req, res) => {
  try {
    const result = await checkinService.pickupChildren(
      req.currentUser,
      req.params.id,
      req.body
    );
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/search', async (req, res) => {
  try {
    const result = await checkinService.searchCheckins(
      req.currentUser,
      req.query
    );
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;