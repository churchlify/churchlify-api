/*
#swagger.tags = ['Fellowship']
*/
// routes/fellowship.js
const express = require('express');
const Fellowship = require('../models/fellowship');
const {validateFellowship} = require('../middlewares/validators');
const router = express.Router();
const {createFcmTopic} = require('../common/push.service');
/*
#swagger.tags = ['Fellowship']
*/

/*#swagger.tags = ['Fellowship']
#swagger.description = "POST /create"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Fellowship" } }*/
router.post('/create', validateFellowship(), async(req, res) => {
    const { church, name, description, leaderId, address, dayOfWeek, meetingTime } = req.body;
    const newItem = new Fellowship({ church, name, description, leaderId, address  , dayOfWeek, meetingTime });
    try {
      await newItem.save();
      const topic = `fellowship_${newItem._id}`;
      await createFcmTopic(topic, 'New Fellowship Created', `Welcome to ${name}!`);
      res.status(201).json({ message: 'Fellowship registered successfully', fellowship: newItem });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});
/*
#swagger.tags = ['Fellowship']
*/

/*#swagger.tags = ['Fellowship']
#swagger.description = "GET /find/:id"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Fellowship" } }*/
router.get('/find/:id', async(req, res) => {
    const { id } = req.params;
    const fellowship = await Fellowship.findById(id).populate('church');
    if (!fellowship) {return res.status(400).json({ message: `Fellowship with id ${id} not found` });}
    res.json({ fellowship });
});
/*
#swagger.tags = ['Fellowship']
*/
router.patch('/update/:id', async(req, res) => {
    const { id } = req.params;
    const updates = req.body;
    try {
        const updatedFellowship = await Fellowship.findByIdAndUpdate(id, {$set:updates}, { new: true, runValidators: true });
        if (!updatedFellowship) {
            return res.status(404).json({ message: `Fellowship with id ${id} not found` });
        }
        res.status(200).json({ message: 'Record updated successfully', fellowship: updatedFellowship });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});
/*
#swagger.tags = ['Fellowship']
*/

/*#swagger.tags = ['Fellowship']
#swagger.description = "GET /list"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Fellowship" } }*/
router.get('/list', async(req, res) => {
    try {
        const ministries = await Fellowship.find().populate('church');
        res.status(200).json({ ministries });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
/*
#swagger.tags = ['Fellowship']
*/

/*#swagger.tags = ['Fellowship']
#swagger.description = "GET /list/:church"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Fellowship" } }*/
router.get('/list/:church', async(req, res) => {
    try {
        const { church } = req.params;
        const ministries = await Fellowship.find({church: church});
        res.status(200).json({ ministries });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
/*
#swagger.tags = ['Fellowship']
*/

/*#swagger.tags = ['Fellowship']
#swagger.description = "DELETE /delete/:id"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Fellowship" } }*/
router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deletedFellowship = await Fellowship.findByIdAndDelete(id);
        if (!deletedFellowship) {
            return res.status(404).json({ error: 'Fellowship not found' });
        }
        res.status(200).json({ message: 'Fellowship deleted successfully', fellowship: deletedFellowship });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
module.exports = router;
