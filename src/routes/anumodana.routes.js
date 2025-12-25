const express = require('express');
const router = express.Router();
const anumodanaController = require('../controllers/anumodana.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const upload = require('../middleware/upload.middleware');

// Public: Get all images
router.get('/', anumodanaController.getImages);

// Admin: Upload image
router.post(
    '/',
    authenticateToken,
    upload.single('image'),
    anumodanaController.uploadImage
);

// Admin: Delete image
router.delete('/:id', authenticateToken, anumodanaController.deleteImage);

module.exports = router;
