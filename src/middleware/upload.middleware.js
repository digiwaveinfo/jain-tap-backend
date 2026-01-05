const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { FILE } = require('../config/constants');
const logger = require('../utils/logger');

// Upload directory path
const uploadDir = path.join(__dirname, '../../uploads/anumodana');

// Ensure uploads directory exists (auto-create if not)
const ensureUploadDir = () => {
  try {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
      logger.info('Created upload directory', { path: uploadDir });
    }
  } catch (error) {
    logger.error('Failed to create upload directory', { error: error.message, path: uploadDir });
  }
};

// Create directory on module load
ensureUploadDir();

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Ensure directory exists before each upload
    ensureUploadDir();
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with sanitized extension (M4 fix)
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    
    // Get extension from mimetype, not originalname (more secure)
    const mimeToExt = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp'
    };
    
    const ext = mimeToExt[file.mimetype] || '.jpg';
    cb(null, 'anumodana-' + uniqueSuffix + ext);
  }
});

// Strict file filter (M4 fix - validate both mimetype and extension)
const fileFilter = (req, file, cb) => {
  // Check mimetype
  if (!FILE.ALLOWED_MIMETYPES.includes(file.mimetype)) {
    logger.warn('File upload rejected - invalid mimetype', { 
      mimetype: file.mimetype,
      originalname: file.originalname 
    });
    return cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'), false);
  }

  // Also check extension from original filename
  const ext = path.extname(file.originalname).toLowerCase();
  if (!FILE.ALLOWED_EXTENSIONS.includes(ext)) {
    logger.warn('File upload rejected - invalid extension', { 
      extension: ext,
      originalname: file.originalname 
    });
    return cb(new Error('Invalid file extension'), false);
  }

  cb(null, true);
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: FILE.MAX_UPLOAD_SIZE,
    files: 1 // Only allow single file upload
  }
});

// Error handling wrapper
const uploadWithErrorHandling = (fieldName) => {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: `File too large. Maximum size is ${FILE.MAX_UPLOAD_SIZE / (1024 * 1024)}MB`
          });
        }
        return res.status(400).json({
          success: false,
          message: err.message
        });
      } else if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      next();
    });
  };
};

module.exports = upload;
module.exports.uploadWithErrorHandling = uploadWithErrorHandling;
module.exports.ensureUploadDir = ensureUploadDir;
