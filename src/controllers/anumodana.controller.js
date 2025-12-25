const dbService = require('../services/db.service');
const fs = require('fs').promises;
const path = require('path');

/**
 * Get all anumodana images (Public)
 */
const getImages = async (req, res) => {
    try {
        const images = await dbService.getAnumodanaImages();

        // Map internal paths to public URLs
        const baseUrl = process.env.API_URL || 'http://localhost:5000';
        const imagesWithUrls = images.map(img => ({
            ...img,
            url: img.url.startsWith('http') ? img.url : `${baseUrl}/uploads/anumodana/${path.basename(img.url)}`
        }));

        res.json({
            success: true,
            data: imagesWithUrls
        });
    } catch (error) {
        console.error('Get images error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch images'
        });
    }
};

/**
 * Upload new image (Admin only)
 */
const uploadImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No image file uploaded'
            });
        }

        const { date, description } = req.body;

        if (!date) {
            // Clean up uploaded file if validation fails
            await fs.unlink(req.file.path).catch(() => { });
            return res.status(400).json({
                success: false,
                message: 'Date is required'
            });
        }

        const imageData = {
            url: req.file.path, // Store local path, convert to URL on serve
            date,
            description
        };

        const result = await dbService.addAnumodanaImage(imageData);

        res.status(201).json({
            success: true,
            message: 'Image uploaded successfully',
            data: result
        });
    } catch (error) {
        console.error('Upload image error:', error);
        // Clean up file if error
        if (req.file) {
            await fs.unlink(req.file.path).catch(() => { });
        }
        res.status(500).json({
            success: false,
            message: 'Failed to upload image',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Delete image (Admin only)
 */
const deleteImage = async (req, res) => {
    try {
        const { id } = req.params;

        // Get image first to delete file
        // Note: We need a get method for single image or search in all
        // Ideally dbService should have getAnumodanaImageById
        // For now we rely on DB delete only? No we must delete file.
        // Let's implement robust fetch

        // Assuming we fetch list and find? Not efficient.
        // Let's assume we implement get by id or just blindly delete from DB and file if we stored path.
        // Since we don't have getById exposed in service for Images yet, let's use dbService directly or add it.
        // But wait, the service I wrote didn't have getById.

        // Quick fix: user query in dbService directly via `db.get` if I exposed query... I didn't.
        // Best: Update db.service.js to add `getAnumodanaImageById` or just list all and filter (ok for small number).
        // Or just fetch all.

        const images = await dbService.getAnumodanaImages(1000);
        const image = images.find(img => img.id === id);

        if (!image) {
            return res.status(404).json({
                success: false,
                message: 'Image not found'
            });
        }

        // Delete file
        try {
            if (image.url && !image.url.startsWith('http')) {
                await fs.unlink(image.url);
            }
        } catch (e) {
            console.warn('File not found for deletion:', image.url);
        }

        await dbService.deleteAnumodanaImage(id);

        res.json({
            success: true,
            message: 'Image deleted successfully'
        });
    } catch (error) {
        console.error('Delete image error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete image'
        });
    }
};

module.exports = {
    getImages,
    uploadImage,
    deleteImage
};
