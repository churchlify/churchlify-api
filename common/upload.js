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
  const filetypes = /jpeg|jpg|png|gif|pdf/;
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
  limits: { fileSize: 200 * 1024 },
  fileFilter: (req, file, cb) => checkFileType(file, cb)
}).single('image');

const uploadDocs= (fields = []) => {
  const upload = multer({
    storage,
    limits: { fileSize: 200 * 1024 }, // 2MB per file
    fileFilter: (req, file, cb) => checkFileType(file, cb)
  }).fields(fields);

  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || err });
      }
      next();
    });
  };
};

const deleteFile = async (fileUrl) => {
  const oldFilename = decodeURIComponent(fileUrl.split('/').pop().trim());
  const filePath = path.join(uploadDir, oldFilename);
  try {
    await fsp.access(filePath, fsp.constants.F_OK);
    await fsp.unlink(filePath);
  } catch (error) {
    console.error(`Error deleting old logo file: ${oldFilename}`, error.message);
  }
};

module.exports = {uploadImage, uploadDocs, uploadDir, checkFileType, storage, deleteFile};