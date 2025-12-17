const express = require('express');
const router = express.Router();
const submissionController = require('../controllers/submission.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const {
  submissionValidationRules,
  updateSubmissionValidationRules,
  handleValidationErrors,
  sanitizeSubmissionData
} = require('../middleware/validation.middleware');

/**
 * Public Routes
 */

// Get booking counts for date range (for calendar display)
router.get(
  '/bookings/date-range',
  submissionController.getBookingCountsByDateRange
);

// Check availability for a specific date
router.get(
  '/bookings/check/:date',
  submissionController.checkDateAvailability
);

// Validate booking date
router.post(
  '/bookings/validate',
  submissionController.validateBookingDate
);

// Create new submission
router.post(
  '/',
  submissionValidationRules,
  handleValidationErrors,
  sanitizeSubmissionData,
  submissionController.createSubmission
);

/**
 * Protected Routes (Admin only)
 */

// Get all submissions (with pagination and filters)
router.get(
  '/',
  authenticateToken,
  submissionController.getAllSubmissions
);

// Get statistics
router.get(
  '/stats',
  authenticateToken,
  submissionController.getStatistics
);

// Search submissions
router.get(
  '/search',
  authenticateToken,
  submissionController.searchSubmissions
);

// Export submissions
router.get(
  '/export',
  authenticateToken,
  submissionController.exportSubmissions
);

// Get submission by ID
router.get(
  '/:id',
  authenticateToken,
  submissionController.getSubmissionById
);

// Update submission
router.put(
  '/:id',
  authenticateToken,
  updateSubmissionValidationRules,
  handleValidationErrors,
  submissionController.updateSubmission
);

// Delete submission
router.delete(
  '/:id',
  authenticateToken,
  submissionController.deleteSubmission
);

module.exports = router;
