const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const logger = require('../logger/logger');

const IMAGE_UPLOAD_MAX_BYTES = Number(process.env.IMAGE_UPLOAD_MAX_BYTES || 5 * 1024 * 1024);
const ALLOWED_FILE_TYPES = /jpeg|jpg|png|gif|webp|heic|heif|pdf/;
const MINIO_ENDPOINT = 'https://s3.churchlify.com';

// Configure S3 Client for MinIO
const s3Client = new S3Client({
  endpoint: MINIO_ENDPOINT,
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY,
  },
  forcePathStyle: true,
});

const BUCKET_NAME = 'churchlify-data';
const storage = multer.memoryStorage();

function getS3ErrorDetails(error = {}) {
  return {
    name: error.name,
    message: error.message,
    code: error.code,
    fault: error.$fault,
    statusCode: error.$metadata && error.$metadata.httpStatusCode,
    requestId: error.$metadata && error.$metadata.requestId,
    extendedRequestId: error.$metadata && error.$metadata.extendedRequestId,
    cfId: error.$metadata && error.$metadata.cfId,
    attempts: error.$metadata && error.$metadata.attempts,
    totalRetryDelay: error.$metadata && error.$metadata.totalRetryDelay,
  };
}

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
  if (!process.env.MINIO_ACCESS_KEY || !process.env.MINIO_SECRET_KEY) {
    const credentialsError = new Error('MinIO credentials are not configured.');
    logger.error('MinIO upload blocked: missing credentials', {
      measurement: 'minio_upload_errors',
      endpoint: MINIO_ENDPOINT,
      hasAccessKey: Boolean(process.env.MINIO_ACCESS_KEY),
      hasSecretKey: Boolean(process.env.MINIO_SECRET_KEY),
      message: credentialsError.message,
    });
    throw credentialsError;
  }

  const ext = path.extname(file.originalname);
  const fileName = `${uuidv4()}${ext}`;

  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
    }));
  } catch (error) {
    logger.error('MinIO upload failed', {
      measurement: 'minio_upload_errors',
      bucket: BUCKET_NAME,
      key: fileName,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      endpoint: MINIO_ENDPOINT,
      ...getS3ErrorDetails(error),
    });
    throw error;
  }

  return `${MINIO_ENDPOINT}/${BUCKET_NAME}/${fileName}`;
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
    console.error('MinIO Delete Error:', error.message);
    if (throwOnError) {
      throw error;
    }
  }
};

module.exports = { uploadImage, uploadDocs, uploadToMinio, deleteFile, IMAGE_UPLOAD_MAX_BYTES };