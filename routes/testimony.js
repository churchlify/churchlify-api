/*
#swagger.tags = ['Testimony']
*/
// routes/testimony.js
const express = require('express');
const Testimony = require('../models/testimony');
const {validateTestimony} = require('../middlewares/validators');
const router = express.Router();
/*
#swagger.tags = ['Testimony']
*/
router.post('/create', validateTestimony(), async(req, res) => {
    const { church, author, title, story, anonymous, isPublic, impact, gratitude } = req.body;
    const newItem = new Testimony({ church, author, title, story, anonymous, isPublic, impact, gratitude  });
    try {
      await newItem.save();
      res.status(201).json({ message: 'Testimony registered successfully', testimony: newItem });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/*
#swagger.tags = ['Testimony']
*/
router.get('/find/:id', async(req, res) => {
    const { id } = req.params;
    const testimony = await Testimony.findById(id).populate('church');
    if (!testimony) {return res.status(404).json({ message: `Testimony with id ${id} not found` });}
    res.json({ testimony });
});
/*
#swagger.tags = ['Testimony']
*/
router.patch('/update/:id', async(req, res) => {
    const { id } = req.params;
    const updates = req.body;
    try {
        const updatedTestimony = await Testimony.findByIdAndUpdate(id, {$set:updates}, { new: true, runValidators: true });
        if (!updatedTestimony) {
            return res.status(404).json({ message: `Testimony with id ${id} not found` });
        }
        res.status(200).json({ message: 'Record updated successfully', testimony: updatedTestimony });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/*
#swagger.tags = ['Testimony']
*/
router.get('/list', async(req, res) => {
    try {
        const church = req.church;
        let filter = {};
        if(church) { filter.church = church._id; }
        const testimonies = await Testimony.find(filter).populate('church');
        res.status(200).json({ testimonies });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
/*
#swagger.tags = ['Testimony']
*/
router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deletedTestimony = await Testimony.findByIdAndDelete(id);
        if (!deletedTestimony) {
            return res.status(404).json({ error: 'Testimony not found' });
        }
        res.status(200).json({ message: 'Testimony deleted successfully', testimony: deletedTestimony });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
module.exports = router;
