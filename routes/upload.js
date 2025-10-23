/*
#swagger.tags = ['Upload']
*/
// routes/upload.js
const {uploadImage} = require('../common/shared');
const express = require('express');
const router = express.Router();
router.use(express.json());

router.post('/create', (req, res) => {
    uploadImage(req, res, (err) => {
        if (err) {res.status(400).json({ message: err });}
        if (req.file === undefined) {res.status(400).json({ message: 'No file selected!' });}
        res.status(200).json({ message: 'File uploaded!', fileUrl: `${process.env.API_BASE_URL}/uploads/${req.file.filename}`});
    });
});
module.exports = router;