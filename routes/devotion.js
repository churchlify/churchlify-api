/*
#swagger.tags = ['Devotion']
*/
// routes/devotion.js
const express = require('express');
const Devotion = require('../models/devotion');
const {validateDevotion} = require('../middlewares/validators');
const router = express.Router();
/*
#swagger.tags = ['Devotion']
*/
router.post('/create', validateDevotion(), async(req, res) => {
    const { church, title, scripture, content, date, author, tags, isPublished } = req.body;
    const newItem = new Devotion({ church, title, scripture, content, date, author, tags, isPublished  });
    try {
      await newItem.save();
      res.status(201).json({ message: 'Devotion registered successfully', devotion: newItem });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/*
#swagger.tags = ['Devotion']
*/
router.get('/find/:id', async(req, res) => {
    const { id } = req.params;
    const devotion = await Devotion.findById(id).populate('church');
    if (!devotion) {return res.status(404).json({ message: `Devotion with id ${id} not found` });}
    res.json({ devotion });
});
/*
#swagger.tags = ['Devotion']
*/
router.patch('/update/:id', async(req, res) => {
    const { id } = req.params;
    const updates = req.body;
    try {
        const updatedDevotion = await Devotion.findByIdAndUpdate(id, {$set:updates}, { new: true, runValidators: true });
        if (!updatedDevotion) {
            return res.status(404).json({ message: `Devotion with id ${id} not found` });
        }
        res.status(200).json({ message: 'Record updated successfully', devotion: updatedDevotion });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/*
#swagger.tags = ['Devotion']
*/
router.get('/list', async(req, res) => {
    try {
        const devotions = await Devotion.find().populate('church');
        res.status(200).json({ devotions });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
/*
#swagger.tags = ['Devotion']
*/
router.get('/list/:church', async(req, res) => {
    try {
        const { church } = req.params;
        const inputDate = new Date(req.query.date || new Date());
        const start = new Date(inputDate.getFullYear(), inputDate.getMonth(), 1);
        const ministries = await Devotion.find({ church: church, date: { $gte: start}}).sort({ date: 1 }); 
        res.status(200).json({ ministries });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
/*
#swagger.tags = ['Devotion']
*/
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
