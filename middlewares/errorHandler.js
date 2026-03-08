const multer = require('multer');
const logger = require('../logger/logger');

const DEFAULT_IMAGE_UPLOAD_MAX_BYTES = Number(process.env.IMAGE_UPLOAD_MAX_BYTES || 5 * 1024 * 1024);

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return 'unknown size';
  }

  if (bytes >= 1024 * 1024) {
    return `${Math.round((bytes / (1024 * 1024)) * 10) / 10}MB`;
  }

  return `${Math.round(bytes / 1024)}KB`;
}

function errorHandler(err, req, res, next) {
  // Log the error to Winston → InfluxDB
  void next;
  logger.error('API Error', {
    measurement: 'http_errors',
    message: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    status: err.status || 500
  });

  // Handle Multer upload errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const maxUploadSize = req.app.get('multerLimitBytes') || DEFAULT_IMAGE_UPLOAD_MAX_BYTES;
      return res.status(400).json({
        type: 'upload_file_too_large',
        message: `File too large. Max size is ${formatBytes(maxUploadSize)}.`,
      });
    }

    return res.status(400).json({ 
      type: 'upload_error',
      message: err.message 
    });
  }

  if (err.status === 400 || /Unsupported file type uploaded/i.test(err.message || '')) {
    return res.status(400).json({
      type: 'upload_invalid_file_type',
      message: err.message
    });
  }

  // Console fallback (useful in development)
  console.error('Unhandled error:', err);

  // Default error response
  return res.status(err.status || 500).json({
    error: true,
    message: err.message || 'Internal Server Error'
  });
}

module.exports = { errorHandler };
