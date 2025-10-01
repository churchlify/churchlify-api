/*
#swagger.tags = ['Checkin']
*/
// routes/kid.js
//const {authenticateFirebaseToken, authenticateToken} = require('../middlewares/auth');
const {isValidObjectId} = require('../middlewares/validators');
const EventInstance = require('../models/eventinstance'); 
const express = require('express');
const CheckIn = require('../models/checkin');
const Kid = require('../models/kid');
const router = express.Router();
//initiate drop-off
/*
#swagger.tags = ['Checkin']
*/

/*#swagger.tags = ['CheckIn']
#swagger.description = "POST /initiate"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/CheckIn" } }*/
router.post('/initiate', async (req, res) => {
    const { child } = req.body;
    const now = Date.now();
    const expiresAt = new Date(now + 15 * 60 * 1000); // 15 minutes from now
    const oneDayAgo = new Date(now - 24 * 3600 * 1000);
    try {
        // Basic validation of child and church
        if (!isValidObjectId(child)) { return res.status(400).json({ error: 'Invalid Child ID provided' }); }
        const kid = await Kid.findById(child).populate('parent');
        if (!kid) { return res.status(400).json({ error: 'Child ID provided does not exist' });}
        const churchId = kid.parent.church;
        // Find an active event instance that is open for check-in
        const checkinOpenInstance = await EventInstance.findOne({ church: churchId, isCheckinOpen: true,
            date: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } 
        });
        if (!checkinOpenInstance) { return res.status(400).json({ message: 'Check-in is not currently open for any events at your church.'
            });
        }
        // Check for existing check-in requests or dropped-off status for the child
        const existingCheckIn = await CheckIn.findOne({ child, status: 'check_in_request', expiresAt: { $gt: new Date() } });
        if (existingCheckIn) {
            return res.status(400).json({
                message: 'Check-in already started, please wait for the current request to expire.'
            });
        }
        const droppedOff = await CheckIn.findOne({ child, status: { $in: ['dropped_off', 'pickup_request'] }, createdAt: { $gte: oneDayAgo }});
        if (droppedOff) {
            return res.status(400).json({ message: 'Child has not been picked up yet.' });
        }
        // Create and save the new check-in record, linking it to the event instance
        const newCheckIn = new CheckIn({  child, expiresAt, eventInstance: checkinOpenInstance._id });
        await newCheckIn.save();
        res.status(201).json({  message: 'Check-in request created successfully', checkIn: newCheckIn, 
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

/*#swagger.tags = ['CheckIn']
#swagger.description = "GET /find/:id"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/CheckIn" } }*/
router.get('/find/:id', async(req, res) => {
    const { id } = req.params;
    const checkin = await CheckIn.findById(id).populate('child');
    if (!checkin){ return res.status(404).json({ message: `CheckIn with id ${id} not found` });}
    res.json({ checkin });
});
/*
#swagger.tags = ['Checkin']
*/

/*#swagger.tags = ['CheckIn']
#swagger.description = "GET /list"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/CheckIn" } }*/
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

/*#swagger.tags = ['CheckIn']
#swagger.description = "GET /list/:child"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/CheckIn" } }*/
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

/*#swagger.tags = ['CheckIn']
#swagger.description = "DELETE /delete/:id"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/CheckIn" } }*/
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