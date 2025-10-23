const express = require('express');
const Payment = require('../models/payment');
const { validatePayment } = require('../middlewares/validators');
const router = express.Router();
router.use(express.json());
router.post('/create', validatePayment(), async (req, res) => {
  const { user, church, payment, paymentId, amount, status, metadata } = req.body;
  const newItem = new Payment({ user, church, payment, paymentId, amount, status, metadata  });
  try {
    await newItem.save();
    res.status(201).json({ message: 'Payment registered successfully', payment: newItem });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.get('/find/:id', async (req, res) => {
  const { id } = req.params;
  const payment = await Payment.findById(id).populate('church');
  if (!payment){ return res.status(404).json({ message: `Payment with id ${id} not found` });}
  res.json({ payment });
});
router.patch('/update/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const updatedPayment = await Payment.findByIdAndUpdate(id, { $set: req.body }, { new: true, runValidators: true });
    if (!updatedPayment) {return res.status(404).json({ message: `Payment with id ${id} not found` });}
    res.status(200).json({ message: 'Record updated successfully', payment: updatedPayment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.get('/list', async (req, res) => {
  try {
    const payments = await Payment.find().populate('church');
    res.status(200).json({ payments });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
router.get('/list', async (req, res) => {
  try {
    const church = req.church;
    let filter = {};
    if(church) { filter.church = church._id; }
    const payments = await Payment.find(filter);
    res.status(200).json({ payments });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
router.delete('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedPayment = await Payment.findByIdAndDelete(id);
    if (!deletedPayment) {return res.status(404).json({ error: 'Payment not found' });}
    res.status(200).json({ message: 'Payment deleted successfully', payment: deletedPayment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;