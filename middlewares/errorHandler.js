const multer = require('multer');

function errorHandler(err, req, res) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        type: 'upload_file_too_large',
        message: `File too large. Max size is ${req.app.get('multerLimit') || '500KB'}.`,
      });
    }
    return res.status(400).json({ message: err.message });
  }

  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
}

module.exports = { errorHandler };