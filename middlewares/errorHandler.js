const multer = require('multer');
const logger = require('../logger/logger');

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
      return res.status(400).json({
        type: 'upload_file_too_large',
        message: `File too large. Max size is ${req.app.get('multerLimit') || '500KB'}.`,
      });
    }

    return res.status(400).json({ 
      type: 'upload_error',
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
