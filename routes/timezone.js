/*
#swagger.tags = ['Timezone']
*/
// routes/timezone.js
const express = require('express');
const Timezone = require('../models/timezone');
const router = express.Router();
router.use(express.json());
/*
#swagger.tags = ['Timezone']
*/
router.post('/create', async(req, res) => {
    const { key, value, continent} = req.body;
    const newItem = new Timezone({ key, value, continent });
    try {
      await newItem.save();
      res.status(201).json({ message: 'Timezone registered successfully', timezone: newItem });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/*
#swagger.tags = ['Timezone']
*/
router.get('/find/:id', async(req, res) => {
    const { id } = req.params;
    const timezone = await Timezone.findById(id);
    if (!timezone) {return res.status(404).json({ message: `Timezone with id ${id} not found` });}
    res.json({ timezone });
});
/*
#swagger.tags = ['Timezone']
*/
router.patch('/update/:id', async(req, res) => {
    const { id } = req.params;
    const updates = req.body;
    try {
        const updatedTimezone = await Timezone.findByIdAndUpdate(id, {$set:updates}, { new: true, runValidators: true });
        if (!updatedTimezone) {
            return res.status(404).json({ message: `Timezone with id ${id} not found` });
        }
        res.status(200).json({ message: 'Record updated successfully', timezone: updatedTimezone });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/*
#swagger.tags = ['Timezone']
*/
router.get('/list', async(req, res) => {
    try {
        const timezones = await Timezone.find();
        res.status(200).json({ timezones });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/*
#swagger.tags = ['Timezone']
*/
router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deletedTimezone = await Timezone.findByIdAndDelete(id);
        if (!deletedTimezone) {
            return res.status(404).json({ error: 'Timezone not found' });
        }
        res.status(200).json({ message: 'Timezone deleted successfully', timezone: deletedTimezone });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
module.exports = router;
