const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

/**
 * Public Routes
 */

// Admin login
router.post('/login', adminController.login);

// Health check (public for monitoring)
router.get('/health', adminController.getHealth);

/**
 * Protected Routes (Admin only)
 */

// Get backups list
router.get('/backups', authenticateToken, adminController.getBackups);

// Create manual backup
router.post('/backups', authenticateToken, adminController.createBackup);

// Restore from backup
router.post('/backups/restore', authenticateToken, adminController.restoreBackup);

// Archive old records
router.post('/archive', authenticateToken, adminController.archiveRecords);

module.exports = router;
