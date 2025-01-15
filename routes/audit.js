// routes/kid.js
const {authenticateFirebaseToken, authenticateToken} = require("../middlewares/auth");

const express = require('express');
const Audit = require('../models/audits');
const router = express.Router();


router.get('/find/:id',  async(req, res) => {
    const { id } = req.params;
    const audit = await Audit.findById(id);
    if (!audit) return res.status(400).json({ message: `Audit lo entry with id ${id} not found` });
    res.json({ audit });
});


router.get('/list',  async(req, res) => {
    try {
        const audits = await Audit.find();
        res.status(200).json({ audits });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});


router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deletedItem = await Audit.findByIdAndDelete(id);

        if (!deletedItem) {
            return res.status(404).json({ error: 'Audit entry not found' });
        }

        res.status(200).json({ message: 'Audit entry deleted successfully', Item: deletedItem });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/deleteAll/', async (req, res) => {
    try {
        const { id } = req.params;
        const deletedItem = await Audit.deleteMany({});

        if (!deletedItem) {
            return res.status(404).json({ error: 'Audit entry not found' });
        }

        res.status(200).json({ message: 'Audit entry deleted successfully', Item: deletedItem });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
