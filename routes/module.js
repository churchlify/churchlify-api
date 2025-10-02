const express = require('express');
const Module = require('../models/module');
const { validateModule } = require('../middlewares/validators');
const router = express.Router();
router.post('/create', validateModule(), async (req, res) => {
  const { church, modules, startDate, expiryDate, status, payments } = req.body;
  const newItem = new Module({ church, modules, startDate, expiryDate, status, payments });
  try {
    await newItem.save();
    res.status(201).json({ message: 'Module registered successfully', module: newItem });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.get('/find/:id', async (req, res) => {
  const { id } = req.params;
  const module = await Module.findById(id).populate('church');
  if (!module){ return res.status(404).json({ message: `Module with id ${id} not found` });}
  res.json({ module });
});
router.patch('/update/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const updatedModule = await Module.findByIdAndUpdate(id, { $set: req.body }, { new: true, runValidators: true });
    if (!updatedModule) {return res.status(404).json({ message: `Module with id ${id} not found` });}
    res.status(200).json({ message: 'Record updated successfully', module: updatedModule });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.get('/list', async (req, res) => {
  try {
    const modules = await Module.find().populate('church');
    res.status(200).json({ modules });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
router.get('/list/:church', async (req, res) => {
  try {
    const { church } = req.params;
    const modules = await Module.find({ church });
    res.status(200).json({ modules });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
router.delete('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedModule = await Module.findByIdAndDelete(id);
    if (!deletedModule) {return res.status(404).json({ error: 'Module not found' });}
    res.status(200).json({ message: 'Module deleted successfully', module: deletedModule });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;