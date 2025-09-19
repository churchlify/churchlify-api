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





/*#swagger.tags = ['Testimony']
#swagger.description = "POST /create"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Testimony" } }*/
router.post('/create', validateTestimony(), async(req, res) => {
    const { church, author, title, story, anonymous, isPublic, impact, gratitude } = req.body;
    const newItem = new Testimony({ church, author, title, story, anonymous, isPublic, impact, gratitude  }); 
    try {
      await newItem.save();
      res.status(201).json({ message: 'Testimony registered successfully', testimony: newItem });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});
/*
#swagger.tags = ['Testimony']
*/





/*#swagger.tags = ['Testimony']
#swagger.description = "GET /find/:id"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Testimony" } }*/
router.get('/find/:id', async(req, res) => {
    const { id } = req.params;
    const testimony = await Testimony.findById(id).populate('church');
    if (!testimony) {return res.status(400).json({ message: `Testimony with id ${id} not found` });}
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
        res.status(400).json({ error: err.message });
    }
});
/*
#swagger.tags = ['Testimony']
*/





/*#swagger.tags = ['Testimony']
#swagger.description = "GET /list"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Testimony" } }*/
router.get('/list', async(req, res) => {
    try {
        const ministries = await Testimony.find().populate('church');
        res.status(200).json({ ministries });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
/*
#swagger.tags = ['Testimony']
*/





/*#swagger.tags = ['Testimony']
#swagger.description = "GET /list/:church"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Testimony" } }*/
router.get('/list/:church', async(req, res) => {
    try {
        const { church } = req.params;
        const ministries = await Testimony.find({church: church});
        res.status(200).json({ ministries });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
/*
#swagger.tags = ['Testimony']
*/





/*#swagger.tags = ['Testimony']
#swagger.description = "DELETE /delete/:id"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Testimony" } }*/
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
