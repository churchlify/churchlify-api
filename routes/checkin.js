// routes/kid.js
//const {authenticateFirebaseToken, authenticateToken} = require('../middlewares/auth');
const {isValidObjectId} = require('../middlewares/validators');
const {getTodaysEvents} = require('../common/shared');
const express = require('express');
const CheckIn = require('../models/checkin');
const Kid = require('../models/kid');
const router = express.Router();

//initiate drop-off
router.post('/initiate',  async(req, res) => {
    const { child } = req.body;
    const now = Date.now() ;
    const expiresAt = new Date(now + 15 * 60 * 1000); // 15 minutes from now
    const oneDayAgo = new Date(now - 24 * 3600 * 1000);
    const checkIn = new CheckIn({ child, expiresAt });
    try {
        if (!isValidObjectId(child)) {return res.status(400).json({ error: 'Invalid Child ID provided' });}
        const kid = await Kid.findById(child).populate('parent');
        if(!kid)  {return res.status(400).json({ error: 'Child ID provided does not exist' });}
        const events = await getTodaysEvents(kid.parent.church);
        console.log('Events',events);
        if (events.length < 1) {return res.status(400).json({ message: 'There is no event accepting Children check-in Today' });}
        const existingCheckIn = await CheckIn.findOne({child, status: 'check_in_request', expiresAt:{ $gt: new Date()}});
        if (existingCheckIn){ return res.status(400).json({ message: 'Check in already initiated, try again after current request expires' });}
        const droppedOff = await CheckIn.findOne({child, status: {$in:['dropped_off', 'pickup_request']}, createdAt:{$gte: oneDayAgo}});
        if (droppedOff){ return res.status(400).json({ message: 'Child has not been picked up yet, try again after child pick up' });}

        await checkIn.save();
        res.status(201).json({ message: 'Check in succesful', checkIn });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});
  
  // Update status
  router.patch('/:id/status', async (req, res) => {
    const { status } = req.body;
    const checkIn = await CheckIn.findById(req.params.id);
    if (!checkIn) {return res.status(404).json({ message: 'Check-in not found' });}

    checkIn.status = status;
    await checkIn.save();
  
    res.json(checkIn);
  });

router.get('/find/:id',  async(req, res) => {
    const { id } = req.params;
    const checkin = await CheckIn.findById(id).populate('child');
    if (!checkin){ return res.status(400).json({ message: `CheckIn with id ${id} not found` });}
    res.json({ checkin });
});

router.get('/list',  async(req, res) => {
    try {
        const checkins = await CheckIn.find().populate('child');
        res.status(200).json({ checkins });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.get('/list/:child',  async(req, res) => {
    try {
        const { child } = req.params;
        const checkins = await CheckIn.find({child});
        res.status(200).json({ checkins });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

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