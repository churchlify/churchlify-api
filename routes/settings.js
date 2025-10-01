const express = require('express');
const Setting = require('../models/settings');
const { validateSettings } = require('../middlewares/validators');
const router = express.Router();

/*#swagger.tags = ['Settings']
#swagger.description = "POST /create"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Settings" } }*/
router.post('/create', validateSettings(), async (req, res) => {
  const { church, key, value } = req.body;
  const newItem = new Setting({ church, key, value });
  try {
    await newItem.save();
    res.status(201).json({ message: 'Settings registered successfully', setting: newItem });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*#swagger.tags = ['Settings']
#swagger.description = "GET /find/:id"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Settings" } }*/
router.get('/find/:id', async (req, res) => {
  const { id } = req.params;
  const setting = await Setting.findById(id).populate('church');
  if (!setting){ return res.status(404).json({ message: `Setting with id ${id} not found` });}
  res.json({ setting });
});
router.patch('/update/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const updatedSetting = await Setting.findByIdAndUpdate(id, { $set: req.body }, { new: true, runValidators: true });
    if (!updatedSetting) {return res.status(404).json({ message: `Setting with id ${id} not found` });}
    res.status(200).json({ message: 'Record updated successfully', setting: updatedSetting });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/*#swagger.tags = ['Settings']
#swagger.description = "GET /list"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Settings" } }*/
router.get('/list', async (req, res) => {
  try {
    const settings = await Setting.find().populate('church');
    res.status(200).json({ settings });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/*#swagger.tags = ['Settings']
#swagger.description = "GET /list/:church"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Settings" } }*/
router.get('/list/:church', async (req, res) => {
  try {
    const { church } = req.params;
    const settings = await Setting.find({ church });
    res.status(200).json({ settings });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/*#swagger.tags = ['Settings']
#swagger.description = "DELETE /delete/:id"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/Settings" } }*/
router.delete('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedSetting = await Setting.findByIdAndDelete(id);
    if (!deletedSetting) {return res.status(404).json({ error: 'Setting not found' });}
    res.status(200).json({ message: 'Setting deleted successfully', setting: deletedSetting });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;