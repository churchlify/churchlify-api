/*
#swagger.tags = ['Auth']
*/
// routes/auth.js
const {authenticateFirebaseToken} = require('../middlewares/auth');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const router = express.Router();
/*
#swagger.tags = ['Auth']
*/
router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email, password: hashedPassword });
    try {
        await newUser.save();
        res.status(201).json({ message: newUser });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});
/*
#swagger.tags = ['Auth']
*/
router.get('/protected', authenticateFirebaseToken, (req, res) => {
    res.send(`Hello ${req.user.email}, you have access to this protected route!`);
});
/*
#swagger.tags = ['Auth']
*/
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {return res.status(404).json({ message: 'User not found' });}
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {return res.status(400).json({ message: 'Invalid credentials' });}
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
});
module.exports = router;
