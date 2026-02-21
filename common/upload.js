const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

// Configure S3 Client for MinIO
const s3Client = new S3Client({
  endpoint: 'https://s3.churchlify.com',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY,
  },
  forcePathStyle: true,
});

const BUCKET_NAME = 'churchlify-data';
const storage = multer.memoryStorage();

function checkFileType(file, cb) {
  const filetypes = /jpeg|jpg|png|gif|pdf/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);
  return mimetype && extname ? cb(null, true) : cb(new Error('Error: Images/PDF Only!'));
}

// Single Image Helper
const uploadImage = multer({
  storage,
  limits: { fileSize: 200 * 1024 },
  fileFilter: (req, file, cb) => checkFileType(file, cb)
}).single('image');

// Multi-field Documents Helper
const uploadDocs = (fields = []) => {
  return multer({
    storage,
    limits: { fileSize: 1024 * 1024 * 2 }, // 2MB for docs
    fileFilter: (req, file, cb) => checkFileType(file, cb)
  }).fields(fields);
};

const uploadToMinio = async (file) => {
  const ext = path.extname(file.originalname);
  const fileName = `${uuidv4()}${ext}`;

  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: fileName,
    Body: file.buffer,
    ContentType: file.mimetype,
  }));

  return `https://s3.churchlify.com/${BUCKET_NAME}/${fileName}`;
};

const deleteFile = async (fileUrl) => {
  try {
    const fileName = fileUrl.split('/').pop();
    await s3Client.send(new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileName,
    }));
  } catch (error) {
    console.error(`MinIO Delete Error:`, error.message);
  }
};

module.exports = { uploadImage, uploadDocs, uploadToMinio, deleteFile };