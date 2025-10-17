/*
#swagger.tags = ['Prayer']
*/
const express = require('express');
const Prayer = require('../models/prayer');
const { validatePrayer } = require('../middlewares/validators');
const router = express.Router();
/*
#swagger.tags = ['Prayer']
#swagger.summary = 'Create a new prayer request'
#swagger.requestBody = {
  required: true,
  content: {
    "application/json": {
      schema: { $ref: "#/definitions/Prayer" }
    }
  }
}
#swagger.responses[201] = {
  description: 'Prayer created successfully',
  schema: { $ref: "#/definitions/Prayer" }
}
*/
router.post('/create', validatePrayer(), async (req, res) => {
  const { church, author, title, prayerRequest, anonymous, isPublic, urgency } = req.body;
  const newItem = new Prayer({ church, author, title, prayerRequest, anonymous, isPublic, urgency });
  try {
    await newItem.save();
    res.status(201).json({ message: 'Prayer registered successfully', prayer: newItem });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
/*
#swagger.tags = ['Prayer']
#swagger.summary = 'Find a prayer request by ID'
#swagger.responses[200] = {
  description: 'Prayer found',
  schema: { $ref: "#/definitions/Prayer" }
}
#swagger.responses[404] = { description: 'Prayer not found' }
*/
router.get('/find/:id', async (req, res) => {
  const { id } = req.params;
  const prayer = await Prayer.findById(id).populate('church');
  if (!prayer){ return res.status(404).json({ message: `Prayer with id ${id} not found` });}
  res.json({ prayer });
});
/*
#swagger.tags = ['Prayer']
#swagger.summary = 'Update a prayer request by ID'
#swagger.requestBody = {
  required: true,
  content: {
    "application/json": {
      schema: { $ref: "#/definitions/Prayer" }
    }
  }
}
#swagger.responses[200] = {
  description: 'Prayer updated successfully',
  schema: { $ref: "#/definitions/Prayer" }
}
#swagger.responses[404] = { description: 'Prayer not found' }
*/
router.patch('/update/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const updatedPrayer = await Prayer.findByIdAndUpdate(id, { $set: req.body }, { new: true, runValidators: true });
    if (!updatedPrayer) {return res.status(404).json({ message: `Prayer with id ${id} not found` });}
    res.status(200).json({ message: 'Record updated successfully', prayer: updatedPrayer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
/*
#swagger.tags = ['Prayer']
#swagger.summary = 'Get prayers for a church'
#swagger.parameters['church'] = {
  in: 'path',
  required: true,
  type: 'string',
  description: 'Church ID'
}
#swagger.responses[200] = {
  description: 'List of prayers for the given church',
  schema: [{ $ref: "#/definitions/Prayer" }]
}
*/
router.get('/list', async (req, res) => {
  try {
    const church = req.church;
    let filter = {};
    if(church) { filter.church = church._id; }
    const prayers = await Prayer.find(filter);
    res.status(200).json({ prayers });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
/*
#swagger.tags = ['Prayer']
#swagger.summary = 'Delete a prayer request by ID'
#swagger.responses[200] = {
  description: 'Prayer deleted successfully',
  schema: { $ref: "#/definitions/Prayer" }
}
#swagger.responses[404] = { description: 'Prayer not found' }
*/
router.delete('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedPrayer = await Prayer.findByIdAndDelete(id);
    if (!deletedPrayer) {return res.status(404).json({ error: 'Prayer not found' });}
    res.status(200).json({ message: 'Prayer deleted successfully', prayer: deletedPrayer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;