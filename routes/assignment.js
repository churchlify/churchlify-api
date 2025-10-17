const express = require('express');
const Assignment = require('../models/assignment');
const Ministry = require('../models/ministry');
const Fellowship = require('../models/fellowship');

const { validateAssignment } = require('../middlewares/validators');
const router = express.Router();

router.post('/create', validateAssignment(), async (req, res) => {
  const { userId, ministryId, fellowshipId, role,availability,skills,status,dateAssigned } = req.body;
  const newItem = new Assignment({ userId, ministryId, fellowshipId, role,availability,skills,status,dateAssigned } );
  try {
    await newItem.save();
    res.status(201).json({ message: 'Assignment registered successfully', setting: newItem });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/find/:id', async (req, res) => {
  const { id } = req.params;
  const setting = await Assignment.findById(id).populate('church');
  if (!setting){ return res.status(404).json({ message: `Assignment with id ${id} not found` });}
  res.json({ setting });
});

router.patch('/update/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const updatedAssignment = await Assignment.findByIdAndUpdate(id, { $set: req.body }, { new: true, runValidators: true });
    if (!updatedAssignment) {return res.status(404).json({ message: `Assignment with id ${id} not found` });}
    res.status(200).json({ message: 'Record updated successfully', setting: updatedAssignment });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/list', async (req, res) => {
  try {
    const assignment = await Assignment.find().populate('userId');
    res.status(200).json({ assignment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/list/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const assignment = await Assignment.find({ userId: userId }).sort({ dateAssigned: -1 });
    res.status(200).json({ assignment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedAssignment = await Assignment.findByIdAndDelete(id);
    if (!deletedAssignment) {return res.status(404).json({ error: 'Assignment not found' });}
    res.status(200).json({ message: 'Assignment deleted successfully', setting: deletedAssignment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:userId', async (req, res) => {
  try {
    const {userId } = req.params;
    const church = req.church;
    const filter = {};
    if (church?._id) {
        filter.church = church?._id;
    }
    // Fetch ministries and fellowships for the church
    const [ministries, fellowships, assignments] = await Promise.all([
      Ministry.find(filter),
      Fellowship.find(filter),
      Assignment.find({ userId })
    ]);

    // Helper to check if user is joined
    const isJoined = (itemId, type) => {
      return assignments.some(a =>
        a.status === 'approved' &&
        ((type === 'ministry' && a.ministryId === String(itemId)) ||
         (type === 'fellowship' && a.FellowshipId === String(itemId)))
      );
    };

    const getStatus = (itemId, type) => {
      const match = assignments.find(a =>
        (type === 'ministry' && a.ministryId === String(itemId)) ||
        (type === 'fellowship' && a.FellowshipId === String(itemId))
      );
      return match ? match.status : 'unregistered';
    };

    // Map ministries
    const ministryResults = ministries.map(min => ({
      id: min._id,
      name: min.name,
      leaderId: min.leaderId,
      category: 'ministry',
      address: `${church.address.street}, ${church.address.city}, ${church.address.state}` || null,
      joined: isJoined(min._id, 'ministry'),
      status: getStatus(min._id, 'ministry')
    }));

    // Map fellowships
    const fellowshipResults = fellowships.map(fel => ({
      id: fel._id,
      name: fel.name,
      leaderId: fel.leaderId,
      category: 'fellowship',
      address: `${fel.address.street}, ${fel.address.city}, ${fel.address.state}` || null,
      joined: isJoined(fel._id, 'fellowship'),
      status: getStatus(fel._id, 'fellowship')
    }));

    // Combine and return
    const groups = [...ministryResults, ...fellowshipResults];
    res.json({ success: true, data: groups });

  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
