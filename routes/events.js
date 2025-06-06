// routes/events.js
//const {authenticateFirebaseToken, authenticateToken} = require('../middlewares/auth');
const {validateEvent} = require('../middlewares/validators');
// const {getFlatennedMonthEvents} = require('../common/shared');
const express = require('express');
const Events = require('../models/events');
const Event = require('../models/event');
const EventInstance = require('../models/eventinstance');
const EventService = require('../common/event.service');
//const event = require('../models/event');
const router = express.Router();

router.post('/create',validateEvent(),  async(req, res) => {
    const { church, title, description, startDate, startTime, endDate,endTime, location, flier, allowKidsCheckin, checkinStartTime, reminder, recurrence, createdBy } = req.body;
    //const newItem = new Event({ church, title, description, startDate, startTime, endDate,endTime, location, flier, allowKidsCheckin, checkinStartTime, reminder, recurrence, createdBy } );
    try {
        // Prepare the event data object
        const eventData = {
            church,
            title,
            description,
            startDate: new Date(startDate),
            startTime,
            endDate: new Date(endDate),
            endTime,
            location,
            flier,
            allowKidsCheckin,
            checkinStartTime,
            reminder,
            createdBy
        };

        // Add recurrence data if it exists
        if (recurrence) {
            eventData.isRecurring = true;
            eventData.recurrence = {
                frequency: recurrence.frequency,
                interval: recurrence.interval || 1,
                daysOfWeek: recurrence.daysOfWeek || [], // For weekly recurrence
                endDate: recurrence.endDate ? new Date(recurrence.endDate) : null
            };
        }
         // Use the EventService to create the event
        const newEvent = await EventService.createEvent(eventData);
         res.status(201).json({ 
            message: eventData.isRecurring ? 
                'Recurring event series created successfully' : 
                'Event created successfully',
            event: newEvent
        });
    } catch (err) {
       console.error('Error creating event:', err);
        res.status(400).json({ 
            error: err.message,
            details: err.errors ? Object.values(err.errors).map(e => e.message) : null
        }); 
    }
});

router.get('/find/:id',  async(req, res) => {
    const { id } = req.params;
    const event = await Events.findById(id);
    if (!event){ return res.status(400).json({ message: `Event with id ${id} not found` });}
    res.json({ event });
});

router.get('/findByDate/:date/:church',  async(req, res) => {
    const { church, date, to } = req.params;
    const event = await EventService.getEvents({ from:date,to, church });
    if (!event){ return res.status(event.code || 500).json({  error: event.error , message: `Event with date ${date} not found` });}
    res.json({ event });
});

router.get('/findByDate/:date',  async(req, res) => {
    const { church, date, to } = req.params;
    const event = await EventService.getEvents({ from:date,to, church });
    if (!event){ return res.status(event.code || 500).json({  error: event.error , message: `Event with date ${date} not found` });}
    res.json({ event });
});

router.get('/events', async (req, res) => {
  const { from, to, church } = req.query;
  const result = await EventService.getEvents({ from, to, church });
  
  if (!result.success) {
    return res.status(result.code || 500).json({ error: result.error });
  }
  res.json(result);
});

router.get('/upcoming', async (req, res) => {
    try {
        const now = new Date();
        const body = req.body;
        let filter = {date: { $gte: now }};
        if(body.church) { filter.church = body.church; }
        const event = await EventInstance.findOne(filter).sort({ date: 1 });
        res.json({ event});
    } catch (error) {
        console.error('Error fetching upcoming event:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.put('/update/:id',validateEvent(),  async(req, res) => {
    const { id } = req.params;
    const { church, title, description, startDate, startTime, endDate,endTime, location, flier, reminder, allowKidsCheckin, checkinStartTime, recurrence, createdBy }  = req.body;
    try {
        const updatedEvent = await Events.findByIdAndUpdate(id, {$set:{ church, title, description, startDate, startTime, endDate,endTime, location, flier, reminder, allowKidsCheckin, checkinStartTime, recurrence, createdBy }}, { new: true, runValidators: true });
              
       // const updatedEvent = await Event.findByIdAndUpdate(id, {$set:{ church, title, description, startDate, startTime, endDate,endTime, location, flier, reminder, checkinStartTime, recurrence, createdBy }} , { new: true, runValidators: true });
        if (!updatedEvent) {
            return res.status(404).json({ message: `Event with id ${id} not found` });
        }
         await EventService.expandRecurringEvents(); // re-cache
        res.status(200).json({ message: 'Record updated successfully', Event: updatedEvent });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.get('/list',  async(req, res) => {
    try {
        const events = await EventInstance.find();
        res.status(200).json({ events });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.get('/list/:church',  async(req, res) => {
    try {
        const { church } = req.params;
        const start = new Date(req.query.start || new Date());
        const end = new Date(req.query.end || new Date(Date.now() + 1000 * 60 * 60 * 24 * 30));
        const events = await EventInstance.find({ church: church, date: { $gte: start, $lte: end }
        }).sort({ date: 1 });    
        res.status(200).json({ events });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
         // Delete the base event
        const deletedEvent = await Event.findByIdAndDelete(id);
        if (!deletedEvent) {return res.status(404).json({ error: 'Event not found' });}
        await EventInstance.deleteMany({ id });   // Delete all cached instances
        res.status(200).json({ message: 'Event deleted successfully', event: deletedEvent });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


module.exports = router;
