const dbService = require('../services/db.service');
const logger = require('../utils/logger');
const { sendSuccess, sendError, sendBadRequest, sendNotFound, sendCreated } = require('../utils/response');
const { isValidDateFormat } = require('../utils/helpers');
const fs = require('fs').promises;
const path = require('path');

/**
 * Get all anumodana images (Public)
 */
const getImages = async (req, res) => {
  try {
    const images = await dbService.getAnumodanaImages();

    // Map internal paths to public URLs
    const baseUrl = process.env.API_URL;
    const imagesWithUrls = images.map(img => ({
      ...img,
      url: img.url.startsWith('http') ? img.url : `${baseUrl}/uploads/anumodana/${path.basename(img.url)}`
    }));

    return sendSuccess(res, imagesWithUrls, 'Images retrieved');
  } catch (error) {
    logger.error('Get images error', { error: error.message, requestId: req.id });
    return sendError(res, 'Failed to fetch images');
  }
};

/**
 * Upload new image (Admin only)
 */
const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return sendBadRequest(res, 'No image file uploaded');
    }

    const { date, description } = req.body;

    if (!date) {
      // Clean up uploaded file if validation fails
      await fs.unlink(req.file.path).catch(() => { });
      return sendBadRequest(res, 'Date is required');
    }

    // Validate date format
    if (!isValidDateFormat(date)) {
      await fs.unlink(req.file.path).catch(() => { });
      return sendBadRequest(res, 'Date must be in YYYY-MM-DD format');
    }

    const imageData = {
      url: req.file.path,
      date,
      description: description || null
    };

    const result = await dbService.addAnumodanaImage(imageData);

    logger.info('Image uploaded', { imageId: result.id, date, requestId: req.id });
    return sendCreated(res, result, 'Image uploaded successfully');
  } catch (error) {
    logger.error('Upload image error', { error: error.message, requestId: req.id });
    // Clean up file if error
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => { });
    }
    return sendError(res, 'Failed to upload image');
  }
};

/**
 * Delete image (Admin only)
 * Fixed N+1 query problem (H5 fix) - now uses direct DB query
 */
const deleteImage = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return sendBadRequest(res, 'Image ID is required');
    }

    // Get image by ID directly (H5 fix - avoid loading all images)
    const image = await dbService.getAnumodanaImageById(id);

    if (!image) {
      return sendNotFound(res, 'Image not found');
    }

    // Delete file from filesystem
    try {
      if (image.url && !image.url.startsWith('http')) {
        await fs.unlink(image.url);
        logger.info('Image file deleted', { path: image.url });
      }
    } catch (e) {
      logger.warn('File not found for deletion', { path: image.url });
    }

    // Delete from database
    await dbService.deleteAnumodanaImage(id);

    logger.info('Image deleted', { imageId: id, requestId: req.id });
    return sendSuccess(res, null, 'Image deleted successfully');
  } catch (error) {
    logger.error('Delete image error', { error: error.message, requestId: req.id });
    return sendError(res, 'Failed to delete image');
  }
};

module.exports = {
  getImages,
  uploadImage,
  deleteImage
};
