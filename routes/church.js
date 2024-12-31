// routes/churches.js
const {authenticateFirebaseToken, authenticateToken} = require("../middlewares/auth");
const {validateChurch} = require("../middlewares/validators");
const express = require('express');
const Church = require('../models/Church');
const router = express.Router();

router.post('/create',validateChurch(),  async(req, res) => {
    const { name, shortName, emailAddress, phoneNumber, address,logo } = req.body;
    const newItem = new Church({ name, shortName, emailAddress, phoneNumber, address,logo  });
    try {
        const existingItem = await Church.findOne({ emailAddress });
        if (existingItem) {
            return res.status(400).json({errors: [{type: 'auth_existing_record', msg: `Record with email ${emailAddress} already exists` }]});
        }
        await newItem.save();
        res.status(201).json({ message: 'Church registered successfully' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});
router.get('/find/:id',  async(req, res) => {
    const { id } = req.params;
    const church = await Church.findById(id);
    if (!church) return res.status(400).json({ message: `Church with id ${id} not found` });
    res.json({ church });
});

router.put('/update/:id',validateChurch(),  async(req, res) => {
    const { id } = req.params;
    const { name, shortName, emailAddress, phoneNumber, address,logo } = req.body;
    try {
        const updatedChurch = await Church.findByIdAndUpdate(id, { name, shortName, emailAddress, phoneNumber, address,logo }, { new: true, runValidators: true });
        if (!updatedChurch) {
            return res.status(404).json({ message: `Church with id ${id} not found` });
        }
        res.status(200).json({ message: 'Record updated successfully', church: updatedChurch });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.get('/list',  async(req, res) => {
    try {
        const churches = await Church.find();
        res.status(200).json({ churches });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deletedItem = await Church.findByIdAndDelete(id);
        if (!deletedItem) return res.status(404).json({ error: 'Churc not found' });
        res.status(200).json({ message: 'Church deleted successfully', event: deletedItem });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


module.exports = router;
