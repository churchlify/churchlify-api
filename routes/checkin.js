/*
#swagger.tags = ['Checkin']
*/
// routes/kid.js
//const {authenticateFirebaseToken, authenticateToken} = require('../middlewares/auth');
const {isValidObjectId} = require('../middlewares/validators');
const moment = require('moment-timezone');
const EventInstance = require('../models/eventinstance');
const express = require('express');
const CheckIn = require('../models/checkin');
const Kid = require('../models/kid');
const Church = require('../models/church');
const router = express.Router();
router.use(express.json());
//initiate drop-off
/*
#swagger.tags = ['Checkin']
*/
router.post('/initiate', async (req, res) => {
  const { child } = req.body; // expecting an array of ObjectIds

  try {
    // Validate input
    if (!Array.isArray(child) || child.length === 0 || !child.every(isValidObjectId)) {
      return res.status(400).json({ error: 'Invalid or missing child IDs' });
    }

    // Fetch all kids and validate existence
    const kids = await Kid.find({ _id: { $in: child } }).populate('parent');
    if (kids.length !== child.length) {
      return res.status(400).json({ error: 'One or more child IDs do not exist' });
    }

    // Assume all kids share the same parent/church
    const churchId = kids[0].parent.church;
    const churchData = await Church.findById(churchId);
    const timezone = churchData.timeZone || 'UTC'; // fallback to UTC if not set

    // Timezone-aware calculations
    const now = moment.tz(timezone);
    const expiresAt = now.clone().add(15, 'minutes').toDate();
    const oneDayAgo = now.clone().subtract(1, 'day').toDate();
    const startOfDay = now.clone().startOf('day').toDate();
    const endOfDay = now.clone().endOf('day').toDate();

    // Find an active event instance
    const checkinOpenInstance = await EventInstance.findOne({
      church: churchId,
      isCheckinOpen: true,
      date: { $gte: startOfDay, $lte: endOfDay }
    });

    if (!checkinOpenInstance) {
      return res.status(400).json({
        message: 'Check-in is not currently open for any event at your church.'
      });
    }

    // Check for conflicts per child
    for (const kidId of child) {
      const existingCheckIn = await CheckIn.findOne({
        child: kidId,
        status: 'check_in_request',
        expiresAt: { $gt: now.toDate() }
      });

      if (existingCheckIn) {
        return res.status(400).json({
          message: `Check-in already started for child ${kidId}, please wait for the current request to expire.`
        });
      }

      const droppedOff = await CheckIn.findOne({
        child: kidId,
        status: { $in: ['dropped_off', 'pickup_request'] },
        createdAt: { $gte: oneDayAgo }
      });

      if (droppedOff) {
        return res.status(400).json({
          message: `Child ${kidId} has not been picked up yet.`
        });
      }
    }

    // Create and save the new check-in record
    const newCheckIn = new CheckIn({
      child,
      expiresAt,
      eventInstance: checkinOpenInstance._id
    });

    await newCheckIn.save();

    res.status(201).json({
      message: 'Check-in request created successfully',
      checkIn: newCheckIn,
      eventTitle: checkinOpenInstance.title
    });
  } catch (err) {
    console.error('Check-in error:', err);
    res.status(500).json({ error: err.message });
  }
});


  // Update status
  /*
#swagger.tags = ['Checkin']
*/
router.patch('/:id/status', async (req, res) => {
    const { status } = req.body;
    const checkIn = await CheckIn.findById(req.params.id);
    if (!checkIn) {return res.status(404).json({ message: 'Check-in not found' });}
    checkIn.status = status;
    await checkIn.save();
    res.json(checkIn);
  });
/*
#swagger.tags = ['Checkin']
*/
router.get('/find/:id', async(req, res) => {
    const { id } = req.params;
    const checkin = await CheckIn.findById(id).populate('child');
    if (!checkin){ return res.status(404).json({ message: `CheckIn with id ${id} not found` });}
    res.json({ checkin });
});
/*
#swagger.tags = ['Checkin']
*/
router.get('/list', async(req, res) => {
    try {
        const checkins = await CheckIn.find().populate('child');
        res.status(200).json({ checkins });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
/*
#swagger.tags = ['Checkin']
*/
router.get('/list/:child', async(req, res) => {
    try {
        const { child } = req.params;
        const checkins = await CheckIn.find({child});
        res.status(200).json({ checkins });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
/*
#swagger.tags = ['Checkin']
*/
router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deletedItem = await CheckIn.findByIdAndDelete(id);
        if (!deletedItem) {
            return res.status(404).json({ error: 'Check in record not found' });
        }
        res.status(200).json({ message: 'Check in record deleted successfully', deletedItem });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
module.exports = router;