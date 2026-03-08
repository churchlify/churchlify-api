const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const IMAGE_UPLOAD_MAX_BYTES = Number(process.env.IMAGE_UPLOAD_MAX_BYTES || 5 * 1024 * 1024);
const ALLOWED_FILE_TYPES = /jpeg|jpg|png|gif|webp|heic|heif|pdf/;

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
  const extname = ALLOWED_FILE_TYPES.test(path.extname(file.originalname || '').toLowerCase());
  const mimetype = ALLOWED_FILE_TYPES.test((file.mimetype || '').toLowerCase());

  if (mimetype && extname) {
    return cb(null, true);
  }

  const unsupportedTypeError = new Error('Unsupported file type uploaded. Allowed: jpg, jpeg, png, gif, webp, heic, heif, pdf.');
  unsupportedTypeError.status = 400;
  return cb(unsupportedTypeError);
}

// Single Image Helper
const uploadImage = multer({
  storage,
  limits: { fileSize: IMAGE_UPLOAD_MAX_BYTES },
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

const deleteFile = async (fileUrl, options = {}) => {
  const { throwOnError = false } = options;
  try {
    const fileName = fileUrl.split('/').pop();
    await s3Client.send(new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileName,
    }));
  } catch (error) {
    console.error(`MinIO Delete Error:`, error.message);
    if (throwOnError) {
      throw error;
    }
  }
};

module.exports = { uploadImage, uploadDocs, uploadToMinio, deleteFile, IMAGE_UPLOAD_MAX_BYTES };