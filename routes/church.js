/*
#swagger.tags = ['Church']
*/
// routes/churches.js
// const {authenticateFirebaseToken, authenticateToken} = require('../middlewares/auth');
const {validateChurch} = require('../middlewares/validators');
const express = require('express');
const Church = require('../models/church');
const User = require('../models/user');
const router = express.Router();
/*
#swagger.tags = ['Church']
*/





/*#swagger.tags = ['Church']
#swagger.description = "POST /create"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Church" } }*/
router.post('/create', validateChurch(), async(req, res) => {
    const { name, shortName, createdBy, emailAddress, phoneNumber, address,logo, timeZone } = req.body;
    const newItem = new Church({ name, shortName, createdBy, emailAddress, phoneNumber, address,logo, timeZone  });
    try {
        const existingEmail = await Church.findOne({ emailAddress });
        const existingPhone = await Church.findOne({ phoneNumber });
        const existingUser = await Church.findOne({ createdBy });
        if (existingEmail){ return res.status(400).json({errors: [{type: 'auth_existing_email', msg: `Record with email ${emailAddress} already exists` }]});}
        if (existingPhone){ return res.status(400).json({errors: [{type: 'auth_existing_phone', msg: `Record with phone number ${phoneNumber} already exists` }]});}
        if (existingUser){ return res.status(400).json({errors: [{type: 'auth_existing_user', msg: `Current User is currently affiliated to a church` }]});}
        await newItem.save();
            // Update the user with the church ID
        const userId = req.body.createdBy; // Assuming userId is sent in the request body
        await User.findByIdAndUpdate(userId, { church: newItem._id });
        res.status(201).json({ message: 'Church registered successfully' , church: newItem});
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});
/*
#swagger.tags = ['Church']
*/





/*#swagger.tags = ['Church']
#swagger.description = "GET /find/:id"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Church" } }*/
router.get('/find/:id', async(req, res) => {
    const { id } = req.params;
    const church = await Church.findById(id);
    if (!church) {return res.status(400).json({ message: `Church with id ${id} not found` });}
    res.json({ church });
});
/*
#swagger.tags = ['Church']
*/





/*#swagger.tags = ['Church']
#swagger.description = "PUT /update/:id"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Church" } }*/
router.put('/update/:id',validateChurch(),  async(req, res) => {
    const { id } = req.params;
    const { name, shortName, createdBy, emailAddress, phoneNumber, address,logo, timeZone  } = req.body;
    try {
        const updatedChurch = await Church.findByIdAndUpdate(id, {$set: { name, shortName, createdBy, emailAddress, phoneNumber, address,logo, timeZone  }}, { new: true, runValidators: true });
        if (!updatedChurch) {
            return res.status(404).json({ message: `Church with id ${id} not found` });
        }
        res.status(200).json({ message: 'Record updated successfully', church: updatedChurch });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});
/*
#swagger.tags = ['Church']
*/





/*#swagger.tags = ['Church']
#swagger.description = "GET /list"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Church" } }*/
router.get('/list', async(req, res) => {
    try {
        const churches = await Church.find();
        res.status(200).json({ churches });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
/*
#swagger.tags = ['Church']
*/





/*#swagger.tags = ['Church']
#swagger.description = "DELETE /delete/:id"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Church" } }*/
router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deletedItem = await Church.findByIdAndDelete(id);
        if (!deletedItem) {return res.status(404).json({ error: 'Churc not found' });}
        res.status(200).json({ message: 'Church deleted successfully', event: deletedItem });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
module.exports = router;
