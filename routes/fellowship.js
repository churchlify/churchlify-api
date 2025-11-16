/*
#swagger.tags = ['Fellowship']
*/
// routes/fellowship.js
const express = require('express');
const Fellowship = require('../models/fellowship');
const {validateFellowship} = require('../middlewares/validators');
const router = express.Router();
router.use(express.json());
/*
#swagger.tags = ['Fellowship']
*/
router.post('/create', validateFellowship(), async(req, res) => {
    const { church, name, description, leaderId, address, dayOfWeek, meetingTime } = req.body;
    const newItem = new Fellowship({ church, name, description, leaderId, address  , dayOfWeek, meetingTime });
    try {
      await newItem.save();
      res.status(201).json({ message: 'Fellowship registered successfully', fellowship: newItem });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/*
#swagger.tags = ['Fellowship']
*/
router.get('/find/:id', async(req, res) => {
    const { id } = req.params;
    const fellowship = await Fellowship.findById(id).populate('church');
    if (!fellowship) {return res.status(404).json({ message: `Fellowship with id ${id} not found` });}
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
        res.status(500).json({ error: err.message });
    }
});

/*
#swagger.tags = ['Fellowship']
*/
router.get('/list', async(req, res) => {
    try {
        const church = req.church;
        let filter = {};
        if(church) { filter.church = church._id; }
        const fellowships = await Fellowship.find(filter);
        res.status(200).json({ fellowships });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
/*
#swagger.tags = ['Fellowship']
*/
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
