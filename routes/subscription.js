const express = require('express');
const Subscription = require('../models/subscription');
const { validateSubscription } = require('../middlewares/validators');
const router = express.Router();
router.post('/create', validateSubscription(), async (req, res) => {
  const { church, modules, startDate, expiryDate, status, payments } = req.body;
  const newItem = new Subscription({ church, modules, startDate, expiryDate, status, payments });
  try {
    await newItem.save();
    res.status(201).json({ message: 'Subscription registered successfully', subscription: newItem });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
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
    res.status(500).json({ error: err.message });
  }
});
router.get('/list', async (req, res) => {
  try {
    const church = req.church;
    let filter = {};
    if(church) { filter.church = church._id; }
    const subscriptions = await Subscription.find(filter).populate('church');
    res.status(200).json({ subscriptions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

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