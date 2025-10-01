/*
#swagger.tags = ['Ministry']
*/
// routes/ministry.js
const express = require('express');
const Ministry = require('../models/ministry');
const {validateMinistry} = require('../middlewares/validators');
const router = express.Router();
const {createFcmTopic} = require('../common/push.service');
/*
#swagger.tags = ['Ministry']
*/

/*#swagger.tags = ['Ministry']
#swagger.description = "POST /create"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Ministry" } }*/
router.post('/create', validateMinistry(), async(req, res) => {
    const { church, name, description, leaderId } = req.body;
    const newItem = new Ministry({ church, name, description, leaderId });
    try {
      await newItem.save();
      const topic = `ministry_${newItem._id}`;
      await createFcmTopic(topic, 'New Ministry Created', `Welcome to ${name}!`);
      res.status(201).json({ message: 'Ministry registered successfully', ministry: newItem });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/*
#swagger.tags = ['Ministry']
*/

/*#swagger.tags = ['Ministry']
#swagger.description = "GET /find/:id"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Ministry" } }*/
router.get('/find/:id', async(req, res) => {
    const { id } = req.params;
    const ministry = await Ministry.findById(id).populate('church');
    if (!ministry) {return res.status(404).json({ message: `Ministry with id ${id} not found` });}
    res.json({ ministry });
});
/*
#swagger.tags = ['Ministry']
*/
router.patch('/update/:id', async(req, res) => {
    const { id } = req.params;
    const updates = req.body;
    try {
        const updatedMinistry = await Ministry.findByIdAndUpdate(id, {$set:updates}, { new: true, runValidators: true });
        if (!updatedMinistry) {
            return res.status(404).json({ message: `Ministry with id ${id} not found` });
        }
        res.status(200).json({ message: 'Record updated successfully', ministry: updatedMinistry });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/*
#swagger.tags = ['Ministry']
*/

/*#swagger.tags = ['Ministry']
#swagger.description = "GET /list"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Ministry" } }*/
router.get('/list', async(req, res) => {
    try {
        const ministries = await Ministry.find().populate('church');
        res.status(200).json({ ministries });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
/*
#swagger.tags = ['Ministry']
*/

/*#swagger.tags = ['Ministry']
#swagger.description = "GET /list/:church"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Ministry" } }*/
router.get('/list/:church', async(req, res) => {
    try {
        const { church } = req.params;
        const ministries = await Ministry.find({church: church});
        res.status(200).json({ ministries });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
/*
#swagger.tags = ['Ministry']
*/

/*#swagger.tags = ['Ministry']
#swagger.description = "DELETE /delete/:id"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Ministry" } }*/
router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deletedMinistry = await Ministry.findByIdAndDelete(id);
        if (!deletedMinistry) {
            return res.status(404).json({ error: 'Ministry not found' });
        }
        res.status(200).json({ message: 'Ministry deleted successfully', ministry: deletedMinistry });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
module.exports = router;
