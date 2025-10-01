/*
#swagger.tags = ['Event']
*/
// routes/events.js
//const {authenticateFirebaseToken, authenticateToken} = require('../middlewares/auth');
const {validateEvent} = require('../middlewares/validators');
const {getFlatennedMonthEvents} = require('../common/shared');
const express = require('express');
const Event = require('../models/event');
//const event = require('../models/event');
const router = express.Router();
/*
#swagger.tags = ['Event']
*/

/*#swagger.tags = ['Event']
#swagger.description = "POST /create"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Event" } }*/
router.post('/create', validateEvent(), async(req, res) => {
    const { church, title, description, startDate, startTime, endDate,endTime, location, flier, allowKidsCheckin, checkinStartTime, reminder, recurrence, createdBy } = req.body;
    const newItem = new Event({ church, title, description, startDate, startTime, endDate,endTime, location, flier, allowKidsCheckin, checkinStartTime, reminder, recurrence, createdBy } );
    try {
        await newItem.save();
        res.status(201).json({ message: 'Event registered successfully' , event: newItem});
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/*
#swagger.tags = ['Event']
*/

/*#swagger.tags = ['Event']
#swagger.description = "GET /find/:id"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Event" } }*/
router.get('/find/:id', async(req, res) => {
    const { id } = req.params;
    const event = await Event.findById(id);
    if (!event){ return res.status(404).json({ message: `Event with id ${id} not found` });}
    res.json({ event });
});
/*
#swagger.tags = ['Event']
*/

/*#swagger.tags = ['Event']
#swagger.description = "GET /findByDate/:date/:church"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Event" } }*/
router.get('/findByDate/:date/:church', async(req, res) => {
    const { church, date } = req.params;
    const event = await getFlatennedMonthEvents(date, church);
    if (!event){ return res.status(404).json({ message: `Event with date ${date} not found` });}
    res.json({ event });
});
/*
#swagger.tags = ['Event']
*/

/*#swagger.tags = ['Event']
#swagger.description = "GET /findByDate/:date"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Event" } }*/
router.get('/findByDate/:date', async(req, res) => {
    const { date } = req.params;
    const event = await getFlatennedMonthEvents(date);
    if (!event) {return res.status(404).json({ message: `Event with date ${date} not found` });}
    res.json({ event });
});
/*
#swagger.tags = ['Event']
*/

/*#swagger.tags = ['Event']
#swagger.description = "PUT /update/:id"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Event" } }*/
router.put('/update/:id',validateEvent(),  async(req, res) => {
    const { id } = req.params;
    const { church, title, description, startDate, startTime, endDate,endTime, location, flier, reminder, allowKidsCheckin, checkinStartTime, recurrence, createdBy }  = req.body;
    try {
        const updatedEvent = await Event.findByIdAndUpdate(id, {$set:{ church, title, description, startDate, startTime, endDate,endTime, location, flier, reminder, allowKidsCheckin, checkinStartTime, recurrence, createdBy }}, { new: true, runValidators: true });
       // const updatedEvent = await Event.findByIdAndUpdate(id, {$set:{ church, title, description, startDate, startTime, endDate,endTime, location, flier, reminder, checkinStartTime, recurrence, createdBy }} , { new: true, runValidators: true });
        if (!updatedEvent) {
            return res.status(404).json({ message: `Event with id ${id} not found` });
        }
        res.status(200).json({ message: 'Record updated successfully', Event: updatedEvent });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/*
#swagger.tags = ['Event']
*/

/*#swagger.tags = ['Event']
#swagger.description = "GET /list"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Event" } }*/
router.get('/list', async(req, res) => {
    try {
        const events = await Event.find();
        res.status(200).json({ events });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
/*
#swagger.tags = ['Event']
*/

/*#swagger.tags = ['Event']
#swagger.description = "GET /list/:church"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Event" } }*/
router.get('/list/:church', async(req, res) => {
    try {
        const { church } = req.params;
        const events = await Event.find({church: church});
        res.status(200).json({ events });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
/*
#swagger.tags = ['Event']
*/

/*#swagger.tags = ['Event']
#swagger.description = "DELETE /delete/:id"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Event" } }*/
router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deletedItem = await Event.findByIdAndDelete(id);
        if (!deletedItem) {return res.status(404).json({ error: 'Event not found' });}
        res.status(200).json({ message: 'Event deleted successfully', event: deletedItem });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
module.exports = router;
