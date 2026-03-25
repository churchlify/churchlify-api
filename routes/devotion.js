/*
#swagger.tags = ['Devotion']
*/
// routes/devotion.js
const express = require('express');
const Devotion = require('../models/devotion');
const {validateDevotion} = require('../middlewares/validators');
const {uploadImage, deleteFile, uploadToMinio} = require('../common/upload');
// Unused imports removed
// moment import removed (unused)
const attachTimezone = require('../middlewares/attachTimezone');
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
router.get('/find/:id', attachTimezone, async(req, res) => {
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
router.get('/list', attachTimezone, async(req, res) => {
    try {
        const churchId = req.church?._id;
        // Use UTC for all date calculations
        let startDate;
        if (req.query.date) {
            // Parse input date as UTC
            startDate = new Date(req.query.date);
        } else {
            // Use current UTC date
            const now = new Date();
            startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        }
        const filter = { date: { $gte: startDate } };
        if (churchId) {
            filter.church = churchId;
        }
        const devotions = await Devotion.find(filter).select('title scripture content date author tags isPublished church').lean();
        res.status(200).json({ devotions, churchTimezone: res.locals.churchTimezone });
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
