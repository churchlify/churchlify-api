/*
#swagger.tags = ['Venue']
*/
const express = require('express');
const Venue = require('../models/venue');
const { validatePrayer } = require('../middlewares/validators');
const router = express.Router();
router.use(express.json());

router.post('/create', validatePrayer(), async (req, res) => {
  const { name, address } = req.body;
  const church = req.church;
  const newItem = new Venue({ name,address, church });
  try {
    await newItem.save();
    res.status(201).json({ message: 'Venue registered successfully', venue: newItem });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/find/:id', async (req, res) => {
  const { id } = req.params;
  const venue = await Venue.findById(id).populate('church');
  if (!venue){ return res.status(404).json({ message: `Venue with id ${id} not found` });}
  res.json({ venue });
});

router.patch('/update/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const updatedVenue = await Venue.findByIdAndUpdate(id, { $set: req.body }, { new: true, runValidators: true });
    if (!updatedVenue) {return res.status(404).json({ message: `Venue with id ${id} not found` });}
    res.status(200).json({ message: 'Record updated successfully', venue: updatedVenue });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/list', async (req, res) => {
  try {
    const church = req.church;
    let filter = {};
    if(church) { filter.church = church._id; }
    const venues = await Venue.find(filter);
    res.status(200).json({ venues });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedVenue = await Venue.findByIdAndDelete(id);
    if (!deletedVenue) {return res.status(404).json({ error: 'Venue not found' });}
    res.status(200).json({ message: 'Venue deleted successfully', venue: deletedVenue });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;