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
      // invalidate cache for this church
      await require('../common/cache').del(church, 'fellowships:list');
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
    const fellowship = await Fellowship.findById(id).populate('church').lean();
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
        // invalidate cache for the church
        if(updatedFellowship.church) {
            await require('../common/cache').del(updatedFellowship.church.toString(), 'fellowships:list');
        }
        res.status(200).json({ message: 'Record updated successfully', fellowship: updatedFellowship });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/*
#swagger.tags = ['Fellowship']
*/
const { get, set } = require('../common/cache');

router.get('/list', async(req, res) => {
    try {
        const church = req.church;
        if(!church) {
            return res.status(400).json({ message: 'Church header missing' });
        }
        const cacheKey = 'fellowships:list';
        const cached = await get(church._id, cacheKey);
        if (cached) {
            return res.status(200).json({ fellowships: cached, cached: true });
        }

        let filter = { church: church._id };
        const fellowships = await Fellowship.find(filter)
            .select('name description leaderId address dayOfWeek meetingTime')
            .lean();

        // store for 60 seconds
        await set(church._id, cacheKey, fellowships, 60);
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
        // invalidate cache for the church
        if(deletedFellowship.church){
            await require('../common/cache').del(deletedFellowship.church.toString(), 'fellowships:list');
        } 
        res.status(200).json({ message: 'Fellowship deleted successfully', fellowship: deletedFellowship });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
module.exports = router;
