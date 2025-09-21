const express = require('express');
const Subscription = require('../models/subscription');
const { validateSubscription } = require('../middlewares/validators');
const router = express.Router();

/*#swagger.tags = ['Subscription']
#swagger.description = "POST /create"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Subscription" } }*/
router.post('/create', validateSubscription(), async (req, res) => {
  const { church, modules, startDate, expiryDate, status, payments } = req.body;
  const newItem = new Subscription({ church, modules, startDate, expiryDate, status, payments });
  try {
    await newItem.save();
    res.status(201).json({ message: 'Subscription registered successfully', subscription: newItem });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/*#swagger.tags = ['Subscription']
#swagger.description = "GET /find/:id"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Subscription" } }*/
router.get('/find/:id', async (req, res) => {
  const { id } = req.params;
  const subscription = await Subscription.findById(id).populate('church');
  if (!subscription){ return res.status(404).json({ message: `Subscription with id ${id} not found` });}
  res.json({ subscription });
});
router.patch('/update/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const updatedSubscription = await Subscription.findByIdAndUpdate(id, { $set: req.body }, { new: true, runValidators: true });
    if (!updatedSubscription) {return res.status(404).json({ message: `Subscription with id ${id} not found` });}
    res.status(200).json({ message: 'Record updated successfully', subscription: updatedSubscription });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/*#swagger.tags = ['Subscription']
#swagger.description = "GET /list"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Subscription" } }*/
router.get('/list', async (req, res) => {
  try {
    const subscriptions = await Subscription.find().populate('church');
    res.status(200).json({ subscriptions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/*#swagger.tags = ['Subscription']
#swagger.description = "GET /list/:church"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Subscription" } }*/
router.get('/list/:church', async (req, res) => {
  try {
    const { church } = req.params;
    const subscriptions = await Subscription.find({ church });
    res.status(200).json({ subscriptions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/*#swagger.tags = ['Subscription']
#swagger.description = "DELETE /delete/:id"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Subscription" } }*/
router.delete('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedSubscription = await Subscription.findByIdAndDelete(id);
    if (!deletedSubscription) {return res.status(404).json({ error: 'Subscription not found' });}
    res.status(200).json({ message: 'Subscription deleted successfully', subscription: deletedSubscription });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;