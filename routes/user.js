// routes/user.js
const {authenticateFirebaseToken, authenticateToken} = require("../middlewares/auth");

const express = require('express');
const User = require('../models/user');
const Church = require('../models/Church');
const {validateUser} = require("../middlewares/validators");
const router = express.Router();

router.post('/create',validateUser(),  async(req, res) => {
    const { church, firstName, lastName, emailAddress, phoneNumber, address, gender, dateOfBirth, isMarried, anniversaryDate, firebaseId, photoUrl, pushToken, role } = req.body;
    const newItem = new User({ church, firstName, lastName, emailAddress, phoneNumber, address, gender, dateOfBirth, isMarried, anniversaryDate,  firebaseId, photoUrl, pushToken, role });
    try {
        const existingItem = await User.findOne({ emailAddress });
        if (existingItem) {
            return res.status(400).json({errors: [{type: 'auth_existing_record', msg: `Record with email ${emailAddress} already exists` }]});
        }
        await newItem.save();
        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});
router.get('/find/:id',  async(req, res) => {
    const { id } = req.params;
    const user = await User.findById(id).populate('church');
    if (!user) return res.status(400).json({ message: `User with id ${id} not found` });
    res.json({ user });
});

router.get('/findByUid/:firebaseId',  async(req, res) => {
    const { firebaseId } = req.params;
    const user = await User.findOne({ firebaseId });
    if (!user) return res.status(400).json({ message: `User with firebaseId ${firebaseId} not found` });
    res.json({ user });
});

router.put('/update/:id',validateUser(),  async(req, res) => {
    const { id } = req.params;
    const { church, firstName, lastName, emailAddress, phoneNumber, address, gender, dateOfBirth, isMarried, anniversaryDate, isChurchAdmin, role } = req.body;
    try {
        const updatedUser = await User.findByIdAndUpdate(id, {$set:{ church, firstName, lastName, emailAddress, phoneNumber, address, gender, dateOfBirth, isMarried, anniversaryDate, isChurchAdmin, role }}, { new: true, runValidators: true });
        if (!updatedUser) {
            return res.status(404).json({ message: `User with id ${id} not found` });
        }
        res.status(200).json({ message: 'Record updated successfully', user: updatedUser });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.get('/list',  async(req, res) => {
    try {
        const users = await User.find().populate('church');
        res.status(200).json({ users });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deletedUser = await User.findByIdAndDelete(id);

        if (!deletedUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.status(200).json({ message: 'User deleted successfully', user: deletedUser });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
