/*
#swagger.tags = ['Events']
*/
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
/*
#swagger.tags = ['Events']
*/
router.post('/create', validateEvent(), async(req, res) => {
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
        res.status(500).json({
            error: err.message,
            details: err.errors ? Object.values(err.errors).map(e => e.message) : null
        });
    }
});
/*
#swagger.tags = ['Events']
*/
router.get('/find/:id', async(req, res) => {
    const { id } = req.params;
    const event = await Events.findById(id);
    if (!event){ return res.status(404).json({ message: `Event with id ${id} not found` });}
    res.json({ event });
});
/*
#swagger.tags = ['Events']
*/
router.get('/findByDate/:date/:church', async(req, res) => {
    const { church, date, to } = req.params;
    const event = await EventService.getEvents({ from:date,to, church });
    if (!event){ return res.status(event.code || 500).json({  error: event.error , message: `Event with date ${date} not found` });}
    res.json({ event });
});
/*
#swagger.tags = ['Events']
*/
router.get('/findByDate/:date', async(req, res) => {
    const { church, date, to } = req.params;
    const event = await EventService.getEvents({ from:date,to, church });
    if (!event){ return res.status(event.code || 500).json({  error: event.error , message: `Event with date ${date} not found` });}
    res.json({ event });
});
/*
#swagger.tags = ['Events']
*/
router.get('/events', async (req, res) => {
  const { from, to, church } = req.query;
  const result = await EventService.getEvents({ from, to, church });
  if (!result.success) {
    return res.status(result.code || 500).json({ error: result.error });
  }
  res.json(result);
});
/*
#swagger.tags = ['Events']
*/
router.get('/upcoming', async (req, res) => {
    try {
        const now = new Date();
        const church = req.church;
        let filter = {date: { $gte: now }};
        if(church) { filter.church = church._id; }
        const event = await EventInstance.findOne(filter).sort({ date: 1 });
        res.json({ event});
    } catch (error) {
        console.error('Error fetching upcoming event:', error);
        res.status(500).json({ message: 'Server error' });
    }
});
/*
#swagger.tags = ['Events']
*/
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
        res.status(500).json({ error: err.message });
    }
});

/*
#swagger.tags = ['Events']
*/
router.get('/list', async(req, res) => {
    try {
        const church = req.church;
        const inputDate = new Date(req.query.date || new Date());
        const start = new Date(inputDate.getFullYear(), inputDate.getMonth(), 1); //{date: { $gte: start }};
        const filter = {date: { $gte: start }};
        if (church?._id) {
            filter.church = church._id;
        }
       // const end = new Date(req.query.end || new Date(Date.now() + 1000 * 60 * 60 * 24 * 30));
        const events = await EventInstance.find(filter).sort({ date: 1 });
        res.status(200).json({ events });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
/*
#swagger.tags = ['Events']
*/
router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
         // Delete the base event
        const deletedEvent = await Event.findByIdAndDelete(id);
        if (!deletedEvent) {return res.status(404).json({ error: 'Event not found' });}
        await EventInstance.deleteMany({ eventId: id });   // Delete all cached instances
        res.status(200).json({ message: 'Event deleted successfully', event: deletedEvent });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/*
#swagger.tags = ['Events']
*/
router.put('/update-checkin-status/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { isCheckinOpen } = req.body;
        if (typeof isCheckinOpen !== 'boolean') {
            return res.status(400).json({ error: 'isCheckinOpen must be a boolean value.' });
        }
        // Find the specific event instance and update the field
        const updatedInstance = await EventInstance.findByIdAndUpdate( id,
            { $set: { isCheckinOpen: isCheckinOpen } },
            { new: true, runValidators: true }
        );
        if (!updatedInstance) {
            return res.status(404).json({ error: 'Event instance not found.' });
        }
        const statusMessage = isCheckinOpen ? 'open' : 'closed';
        res.status(200).json({
            message: `Check-in for instance "${updatedInstance.title}" on ${updatedInstance.date.toDateString()} is now ${statusMessage}.`,
            eventInstance: updatedInstance
        });
    } catch (err) {
        console.error('Error updating check-in status:', err);
        res.status(500).json({ error: 'Server error occurred while updating check-in status.' });
    }
});
module.exports = router;
