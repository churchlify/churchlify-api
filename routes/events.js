// routes/events.js
const {authenticateFirebaseToken, authenticateToken} = require("../middlewares/auth");
const {validateEvent} = require("../middlewares/validators");
const express = require('express');
const Event = require('../models/event');
const router = express.Router();

 async function getFlatennedMonthEvents(d, churchId =""){
    const startOfMonth = new Date(new Date(d).getFullYear(), new Date(d).getMonth(), 1);
    const endOfMonth = new Date(new Date(d).getFullYear(), new Date(d).getMonth() + 1, 0);
    let flattenedEvents =[];
    let query = {
        $or: [
            { startDate: { $lte: endOfMonth }, endDate: { $gte: startOfMonth } },
            { startDate: { $gte: startOfMonth, $lte: endOfMonth } }
        ]
    }
    if (churchId) query =  { $and: [ query, {church: churchId}] }
    const events = await Event.find(query);
    events.forEach(event => {
        let currentDate = new Date(event.startDate);
        const eventEndDate = new Date(event.endDate);
        while (currentDate <= eventEndDate && currentDate <= endOfMonth) {
          if (currentDate >= startOfMonth) {
            flattenedEvents.push({
              id: event.id + "_" +event.startDate.toISOString().replace(/[^\w\s]/gi, ''),
              church: event.church,
              title: event.title,
              description: event.description,
              startDate: new Date(currentDate),
              startTime: event.startTime,
              endTime: event.endTime,
              createdBy: event.createdBy,
              location: event.location,
              flier: event.flier,
              reminder: event.reminder,
            });
          }

          if(event.recurrence){
              switch (event.recurrence.frequency) {
                  case 'daily':
                      currentDate.setDate(currentDate.getDate() + 1);
                      break;
                  case 'weekly':
                      currentDate.setDate(currentDate.getDate() + 7);
                      break;
                  case 'monthly':
                      currentDate.setMonth(currentDate.getMonth() + 1);
                      break;
                  case 'yearly':
                      currentDate.setFullYear(currentDate.getFullYear() + 1);
                      break;
                  default:
                      currentDate = new Date(eventEndDate.getTime() + 1); // Move past the end date to exit the loop
              }
          }else{
              currentDate = new Date(eventEndDate.getTime() + 1);
          }
          //  console.log("currentDate", currentDate,event)
        }
      });
    // console.log("flattenedEvents", flattenedEvents)
    return flattenedEvents;
  }


router.post('/create',validateEvent(),  async(req, res) => {
    const { church, title, description, startDate, startTime, endDate,endTime, location, flier, reminder, recurrence, createdBy } = req.body;
    const newItem = new Event({ church, title, description, startDate, startTime, endDate,endTime, location, flier, reminder, recurrence, createdBy } );
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

router.get('/findByDate/:date/:church',  async(req, res) => {
    const { church, date } = req.params;
    const event = await getFlatennedMonthEvents(date, church);
    if (!event) return res.status(400).json({ message: `Event with id ${id} not found` });
    res.json({ event });
});

router.get('/findByDate/:date',  async(req, res) => {
    const { date } = req.params;
    const event = await getFlatennedMonthEvents(date);
    if (!event) return res.status(400).json({ message: `Event with id ${id} not found` });
    res.json({ event });
});

router.put('/update/:id',validateEvent(),  async(req, res) => {
    const { id } = req.params;
    const { church, title, description, startDate, startTime, endDate,endTime, location, flier, reminder, recurrence, createdBy }  = req.body;
    try {
        const updatedEvent = await Event.findByIdAndUpdate(id, { church, title, description, startDate, startTime, endDate,endTime, location, flier, reminder, recurrence, createdBy } , { new: true, runValidators: true });
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

router.get('/list/:church',  async(req, res) => {
    try {
        const { church } = req.params;
        const events = await Event.find({church: church});
        res.status(200).json({ events });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deletedItem = await Event.findByIdAndDelete(id);
        if (!deletedItem) return res.status(404).json({ error: 'Event not found' });
        res.status(200).json({ message: 'Event deleted successfully', event: deletedItem });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
