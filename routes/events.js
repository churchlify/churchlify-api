// routes/events.js
const {authenticateFirebaseToken, authenticateToken} = require("../middlewares/auth");
const {validateEvent} = require("../middlewares/validators");
const express = require('express');
const Event = require('../models/event');
const router = express.Router();

router.post('/create',validateEvent(),  async(req, res) => {
    const { church, title, description, startDate, startTime, endDate,endTime, location, reminder, recurrence } = req.body;
    const newItem = new Event({ church, title, description, startDate, startTime, endDate,endTime, location, reminder, recurrence } );
    try {
        await newItem.save();
        res.status(201).json({ message: 'Event registered successfully' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});
router.get('/find/:id',  async(req, res) => {
    const { id } = req.params;
    const event = await Event.findById(id);
    if (!event) return res.status(400).json({ message: `Event with id ${id} not found` });
    res.json({ event });
});

router.put('/update/:id',validateEvent(),  async(req, res) => {
    const { id } = req.params;
    const { church, title, description, startDate, startTime, endDate,endTime, location, reminder, recurrence }  = req.body;
    try {
        const updatedEvent = await Event.findByIdAndUpdate(id, { church, title, description, startDate, startTime, endDate,endTime, location, reminder, recurrence } , { new: true, runValidators: true });
        if (!updatedEvent) {
            return res.status(404).json({ message: `Event with id ${id} not found` });
        }
        res.status(200).json({ message: 'Record updated successfully', Event: updatedEvent });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.get('/list',  async(req, res) => {
    try {
        const events = await Event.find();
        res.status(200).json({ events });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
