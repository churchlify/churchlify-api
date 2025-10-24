const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { v4: uuidv4 } = require('uuid');

const uploadDir = path.join(__dirname, '..', 'files_upload');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

function checkFileType(file, cb) {
  const filetypes = /jpeg|jpg|png|gif/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);
  return mimetype && extname ? cb(null, true) : cb('Error: Images Only!');
}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const uploadImage = multer({
  storage,
  limits: { fileSize: 500000 },
  fileFilter: (req, file, cb) => checkFileType(file, cb)
}).single('image');

const deleteFile = async (fileUrl) => {
  const oldFilename = fileUrl.split('/').pop();
  const filePath = path.join(__dirname, '..', 'uploads', oldFilename);
  try {
        await fsp.unlink(filePath);
        console.log(`Successfully deleted old logo: ${oldFilename}`);
    } catch (error) {
        console.error(`Error deleting old logo file: ${oldFilename}`, error.message);
    }
};

module.exports = {uploadImage, uploadDir, checkFileType, storage, deleteFile};