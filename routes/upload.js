/*
#swagger.tags = ['Upload']
*/
// routes/upload.js
//const {authenticateFirebaseToken, authenticateToken} = require('../middlewares/auth');
const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const router = express.Router();
// Check file type
function checkFileType(file, cb) {
    const filetypes = /jpeg|jpg|png|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    return (mimetype && extname) ? cb(null, true) : cb('Error: Images Only!');
}
// Set up storage engine with obfuscated file names
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        const hash = crypto.createHash('sha256').update(Date.now().toString()).digest('hex');
        const ext = path.extname(file.originalname);
        cb(null, `${hash}${ext}`);
    }
});
// Initialize upload
const upload = multer({
    storage: storage,
    limits: { fileSize: 500000 }, // Limit file size to 500kb
    fileFilter: (req, file, cb) => { checkFileType(file, cb);}
}).single('image');

router.post('/create', (req, res) => {
    upload(req, res, (err) => {
        if (err) {res.status(400).json({ message: err });}
        if (req.file === undefined) {res.status(400).json({ message: 'No file selected!' });}
        res.status(200).json({ message: 'File uploaded!', fileUrl: 'http://localhost:${PORT}/uploads/${req.file.filename'});
    });
});