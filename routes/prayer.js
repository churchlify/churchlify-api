// routes/prayer.js

const express = require('express');
const Prayer = require('../models/prayer');
const {validatePrayer} = require('../middlewares/validators');
const router = express.Router();

router.post('/create',validatePrayer(),  async(req, res) => {
    const { church, author, title, prayerRequest, anonymous, isPublic, urgency } = req.body;
    const newItem = new Prayer({ church, author, title, prayerRequest, anonymous, isPublic, urgency  }); 
    try {
      await newItem.save();
      res.status(201).json({ message: 'Prayer registered successfully', prayer: newItem });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.get('/find/:id',  async(req, res) => {
    const { id } = req.params;
    const prayer = await Prayer.findById(id).populate('church');
    if (!prayer) {return res.status(400).json({ message: `Prayer with id ${id} not found` });}
    res.json({ prayer });
});

router.patch('/update/:id',  async(req, res) => {
    const { id } = req.params;
    const updates = req.body;
    try {
        const updatedPrayer = await Prayer.findByIdAndUpdate(id, {$set:updates}, { new: true, runValidators: true });
        if (!updatedPrayer) {
            return res.status(404).json({ message: `Prayer with id ${id} not found` });
        }
        res.status(200).json({ message: 'Record updated successfully', prayer: updatedPrayer });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.get('/list',  async(req, res) => {
    try {
        const ministries = await Prayer.find().populate('church');
        res.status(200).json({ ministries });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.get('/list/:church',  async(req, res) => {
    try {
        const { church } = req.params;
        const ministries = await Prayer.find({church: church});
        res.status(200).json({ ministries });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deletedPrayer = await Prayer.findByIdAndDelete(id);

        if (!deletedPrayer) {
            return res.status(404).json({ error: 'Prayer not found' });
        }

        res.status(200).json({ message: 'Prayer deleted successfully', prayer: deletedPrayer });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
