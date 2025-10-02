/*
#swagger.tags = ['Upload']
*/
// routes/upload.js
//const {authenticateFirebaseToken, authenticateToken} = require('../middlewares/auth');
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const uploadDir = '/files_upload';

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`Created upload directory at ${uploadDir}`);
}
// Check file type
function checkFileType(file, cb) {
    const filetypes = /jpeg|jpg|png|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    return (mimetype && extname) ? cb(null, true) : cb('Error: Images Only!');
}
// Set up storage engine with obfuscated file names
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
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
        res.status(200).json({ message: 'File uploaded!', fileUrl: `${process.env.API_BASE_URL}/uploads/${req.file.filename}`});
    });
});
module.exports = router;