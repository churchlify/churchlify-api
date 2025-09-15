// routes/devotion.js

const express = require('express');
const Devotion = require('../models/devotion');
const {validateDevotion} = require('../middlewares/validators');
const router = express.Router();

router.post('/create',validateDevotion(),  async(req, res) => {
    const { church, title, scripture, content, date, author, tags, isPublished } = req.body;
    const newItem = new Devotion({ church, title, scripture, content, date, author, tags, isPublished  });
    try {
      await newItem.save();
      res.status(201).json({ message: 'Devotion registered successfully', devotion: newItem });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.get('/find/:id',  async(req, res) => {
    const { id } = req.params;
    const devotion = await Devotion.findById(id).populate('church');
    if (!devotion) {return res.status(400).json({ message: `Devotion with id ${id} not found` });}
    res.json({ devotion });
});

router.patch('/update/:id',  async(req, res) => {
    const { id } = req.params;
    const updates = req.body;
    try {
        const updatedDevotion = await Devotion.findByIdAndUpdate(id, {$set:updates}, { new: true, runValidators: true });
        if (!updatedDevotion) {
            return res.status(404).json({ message: `Devotion with id ${id} not found` });
        }
        res.status(200).json({ message: 'Record updated successfully', devotion: updatedDevotion });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.get('/list',  async(req, res) => {
    try {
        const ministries = await Devotion.find().populate('church');
        res.status(200).json({ ministries });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.get('/list/:church',  async(req, res) => {
    try {
        const { church } = req.params;
        const ministries = await Devotion.find({church: church});
        res.status(200).json({ ministries });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deletedDevotion = await Devotion.findByIdAndDelete(id);

        if (!deletedDevotion) {
            return res.status(404).json({ error: 'Devotion not found' });
        }

        res.status(200).json({ message: 'Devotion deleted successfully', devotion: deletedDevotion });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
