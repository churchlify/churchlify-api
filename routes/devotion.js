/*
#swagger.tags = ['Devotion']
*/
// routes/devotion.js
const express = require('express');
const Devotion = require('../models/devotion');
const {validateDevotion} = require('../middlewares/validators');
const {uploadImage, deleteFile, uploadToMinio} = require('../common/upload');
const { getMonthBoundaries, nowInChurchTz, parseChurchDate } = require('../common/timezone.helper');
const moment = require('moment-timezone');
const router = express.Router();
router.use(express.json());
/*
#swagger.tags = ['Devotion']
*/
router.post('/create', uploadImage, validateDevotion(), async(req, res) => {
    const { church, title, scripture, content, date, author, tags, isPublished } = req.body;
    try {
      let imageUrl = null;
      
      // Handle image upload if provided
      if (req.file) {
        imageUrl = await uploadToMinio(req.file);
      }

      const newItem = new Devotion({ 
        church, 
        title, 
        scripture, 
        content, 
        date, 
        author, 
        tags, 
        isPublished,
        image: imageUrl
      });
      
      await newItem.save();
      res.status(201).json({ message: 'Devotion registered successfully', devotion: newItem });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/*
#swagger.tags = ['Devotion']
*/
router.get('/find/:id', async(req, res) => {
    const { id } = req.params;
    const devotion = await Devotion.findById(id).populate('church').lean();
    if (!devotion) {return res.status(404).json({ message: `Devotion with id ${id} not found` });}
    res.json({ devotion });
});
/*
#swagger.tags = ['Devotion']
*/
router.patch('/update/:id', uploadImage, async(req, res) => {
    const { id } = req.params;
    const updates = req.body;
    try {
        const existingDevotion = await Devotion.findById(id);
        if (!existingDevotion) {
            return res.status(404).json({ message: `Devotion with id ${id} not found` });
        }

        // Handle image upload if provided
        if (req.file) {
            const newImageUrl = await uploadToMinio(req.file);
            updates.image = newImageUrl;

            // Delete old image if it exists
            if (existingDevotion.image) {
                await deleteFile(existingDevotion.image);
            }
        }

        const updatedDevotion = await Devotion.findByIdAndUpdate(id, {$set: updates}, { new: true, runValidators: true });
        res.status(200).json({ message: 'Record updated successfully', devotion: updatedDevotion });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/*
#swagger.tags = ['Devotion']
*/
router.get('/list', async(req, res) => {
    try {
        const churchId = req.church?._id;
        const timezone = req.church?.timeZone || 'UTC';
        
        // Parse input date or use current time in church timezone
        const inputMoment = req.query.date ?
          moment.tz(parseChurchDate(req.query.date, timezone), timezone) :
          nowInChurchTz(timezone);
        
        const { startDate } = getMonthBoundaries(
          inputMoment.year(),
          inputMoment.month() + 1,
          timezone
        );
        
        const filter = {date: { $gte: startDate }};
        if (churchId) {
            filter.church = churchId;
        }
        const devotions = await Devotion.find(filter).select('title scripture date author tags isPublished church').lean();
        res.status(200).json({ devotions });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/*
#swagger.tags = ['Devotion']
*/
router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deletedDevotion = await Devotion.findByIdAndDelete(id);
        if (!deletedDevotion) {
            return res.status(404).json({ error: 'Devotion not found' });
        }

        // Delete associated image if it exists
        if (deletedDevotion.image) {
            await deleteFile(deletedDevotion.image);
        }

        res.status(200).json({ message: 'Devotion deleted successfully', devotion: deletedDevotion });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
module.exports = router;
