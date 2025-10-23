/*
#swagger.tags = ['Kid']
*/
// routes/kid.js
//const {authenticateFirebaseToken, authenticateToken} = require('../middlewares/auth');
const express = require('express');
const Kid = require('../models/kid');
const {validateKid} = require('../middlewares/validators');
const router = express.Router();
router.use(express.json());
/*
#swagger.tags = ['Kid']
*/
router.post('/create', validateKid(), async(req, res) => {
    const { parent, firstName, lastName, gender, dateOfBirth, middlename, color, allergies } = req.body;
    const newItem = new Kid( { parent, firstName, lastName, gender, dateOfBirth, middlename, color, allergies } );
    try {
        await newItem.save();
        res.status(201).json({ message: 'Child registered successfully' , child: newItem});
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/*
#swagger.tags = ['Kid']
*/
router.get('/find/:id', async(req, res) => {
    const { id } = req.params;
    const kid = await Kid.findById(id).populate('parent');
    if (!kid) {return res.status(404).json({ message: `Child with id ${id} not found` });}
    res.json({ kid });
});
/*
#swagger.tags = ['Kid']
*/
router.put('/update/:id',validateKid(),  async(req, res) => {
    const { id } = req.params;
    const { parent, firstName, lastName, gender, dateOfBirth, middlename, color, allergies } = req.body;
    try {
        const updatedKid = await Kid.findByIdAndUpdate(id, {$set:{ parent, firstName, lastName, gender, dateOfBirth, middlename, color, allergies }}, { new: true, runValidators: true });
        if (!updatedKid) {
            return res.status(404).json({ message: `Kid with id ${id} not found` });
        }
        res.status(200).json({ message: 'Record updated successfully', kid: updatedKid });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/*
#swagger.tags = ['Kid']
*/
router.get('/list', async(req, res) => {
    try {
        const kids = await Kid.find().populate('parent');
        res.status(200).json({ kids });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
/*
#swagger.tags = ['Kid']
*/
router.get('/list/:parent', async(req, res) => {
    try {
        const { parent } = req.params;
        const kids = await Kid.find({parent: parent});
        res.status(200).json({ kids });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
/*
#swagger.tags = ['Kid']
*/
router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deletedKid = await Kid.findByIdAndDelete(id);
        if (!deletedKid) {
            return res.status(404).json({ error: 'Child not found' });
        }
        res.status(200).json({ message: 'Child deleted successfully', kid: deletedKid });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
module.exports = router;
