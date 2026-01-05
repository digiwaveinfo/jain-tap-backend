const dbService = require('../services/db.service');
const backupService = require('../services/backup.service');
const emailService = require('../services/email.service');
const logger = require('../utils/logger');
const { getClientIp, validateDateRange, isValidDateFormat } = require('../utils/helpers');
const { sendSuccess, sendError, sendBadRequest, sendNotFound, sendCreated, sendPaginated } = require('../utils/response');
const { BOOKING, HTTP } = require('../config/constants');

/**
 * Create new submission
 */
const createSubmission = async (req, res) => {
  try {
    // Validate booking date if provided
    if (req.body.bookingDate) {
      const validation = await dbService.validateBookingDate(req.body.bookingDate);

      if (!validation.valid) {
        return res.status(HTTP.BAD_REQUEST).json({
          success: false,
          message: validation.error,
          messageGu: validation.errorGu,
          nextAvailableDate: validation.nextAvailableDate
        });
      }
    }

    // Create backup before write
    await backupService.createBackup();

    // Add IP address to submission data
    const submissionData = {
      ...req.body,
      ipAddress: getClientIp(req)
    };

    // Add submission to DB
    const result = await dbService.addSubmission(submissionData);

    logger.info('Submission created', { 
      submissionId: result.id, 
      bookingDate: req.body.bookingDate,
      requestId: req.id 
    });

    // Send confirmation email (if enabled and email provided) - M8 fix: better error handling
    if (submissionData.email) {
      emailService.sendSubmissionConfirmation({
        ...submissionData,
        id: result.id,
        date: result.data.date
      }).then(emailResult => {
        if (!emailResult.success) {
          logger.warn('Email send failed', { 
            submissionId: result.id, 
            error: emailResult.message,
            requestId: req.id 
          });
        }
      }).catch(err => {
        logger.error('Email send error', { 
          submissionId: result.id, 
          error: err.message,
          requestId: req.id 
        });
      });
    }

    res.status(HTTP.CREATED).json(result);
  } catch (error) {
    logger.error('Create submission error', { error: error.message, requestId: req.id });
    return sendError(res, error.message || 'Failed to submit form. Please try again.');
  }
};

/**
 * Get all submissions (Admin only)
 * Uses database-level pagination for better performance
 */
const getAllSubmissions = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, city, state, startDate, endDate } = req.query;

    // Validate pagination params
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));

    // Build filters
    const filters = {};
    if (status) filters.status = status;
    if (city) filters.city = city;
    if (state) filters.state = state;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    // Use database-level pagination
    const result = await dbService.getSubmissionsPaginated(filters, pageNum, limitNum);

    return sendPaginated(res, result.data, result.pagination, 'Submissions retrieved');
  } catch (error) {
    logger.error('Get submissions error', { error: error.message, requestId: req.id });
    return sendError(res, 'Failed to fetch submissions');
  }
};

/**
 * Get submission by ID (Admin only)
 */
const getSubmissionById = async (req, res) => {
  try {
    const { id } = req.params;
    const submission = await dbService.getSubmissionById(id);

    if (!submission) {
      return sendNotFound(res, 'Submission not found');
    }

    return sendSuccess(res, submission, 'Submission retrieved');
  } catch (error) {
    logger.error('Get submission error', { error: error.message, requestId: req.id });
    return sendError(res, 'Failed to fetch submission');
  }
};

/**
 * Update submission (Admin only)
 */
const updateSubmission = async (req, res) => {
  try {
    const { id } = req.params;

    // Create backup before update
    await backupService.createBackup();

    const result = await dbService.updateSubmission(id, req.body);

    logger.info('Submission updated', { submissionId: id, requestId: req.id });
    return sendSuccess(res, result.data, result.message);
  } catch (error) {
    logger.error('Update submission error', { error: error.message, requestId: req.id });

    if (error.message === 'Submission not found') {
      return sendNotFound(res, error.message);
    }

    return sendError(res, 'Failed to update submission');
  }
};

/**
 * Delete submission (Admin only)
 */
const deleteSubmission = async (req, res) => {
  try {
    const { id } = req.params;

    // Create backup before delete
    await backupService.createBackup();

    const result = await dbService.deleteSubmission(id);

    logger.info('Submission deleted', { submissionId: id, requestId: req.id });
    return sendSuccess(res, null, result.message);
  } catch (error) {
    logger.error('Delete submission error', { error: error.message, requestId: req.id });

    if (error.message === 'Submission not found') {
      return sendNotFound(res, error.message);
    }

    return sendError(res, 'Failed to delete submission');
  }
};

/**
 * Search submissions (Admin only)
 */
const searchSubmissions = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return sendBadRequest(res, 'Search query must be at least 2 characters');
    }

    const results = await dbService.searchSubmissions(q);

    return sendSuccess(res, results, `Found ${results.length} results`);
  } catch (error) {
    logger.error('Search submissions error', { error: error.message, requestId: req.id });
    return sendError(res, 'Search failed');
  }
};

/**
 * Get statistics (Admin only)
 */
const getStatistics = async (req, res) => {
  try {
    const stats = await dbService.getStatistics();

    return sendSuccess(res, stats, 'Statistics retrieved');
  } catch (error) {
    logger.error('Get statistics error', { error: error.message, requestId: req.id });
    return sendError(res, 'Failed to fetch statistics');
  }
};

/**
 * Export submissions (Admin only)
 */
const exportSubmissions = async (req, res) => {
  try {
    const { status, city, state, startDate, endDate } = req.query;

    // Build filters
    const filters = {};
    if (status) filters.status = status;
    if (city) filters.city = city;
    if (state) filters.state = state;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const exportPath = await dbService.exportSubmissions(filters);

    logger.info('Submissions exported', { filters, requestId: req.id });

    res.download(exportPath, `submissions_export_${Date.now()}.xlsx`, (err) => {
      if (err) {
        logger.error('Download error', { error: err.message, requestId: req.id });
        if (!res.headersSent) {
          return sendError(res, 'Failed to download export file');
        }
      }
    });
  } catch (error) {
    logger.error('Export submissions error', { error: error.message, requestId: req.id });
    return sendError(res, 'Export failed');
  }
};

/**
 * Get booking counts for date range (M6 fix - with validation)
 */
const getBookingCountsByDateRange = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return sendBadRequest(res, 'startDate and endDate are required');
    }

    // Validate date range (M6 fix)
    const rangeValidation = validateDateRange(startDate, endDate, BOOKING.MAX_DATE_RANGE_DAYS);
    if (!rangeValidation.valid) {
      return sendBadRequest(res, rangeValidation.error);
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    const bookingCounts = await dbService.getBookingCountsByDateRange(start, end);
    const maxBookingsPerDay = await dbService.getSetting('max_bookings_per_day', '3');

    return res.json({
      success: true,
      bookingCounts,
      maxBookingsPerDay: parseInt(maxBookingsPerDay, 10)
    });
  } catch (error) {
    logger.error('Get booking counts error', { error: error.message, requestId: req.id });
    return sendError(res, 'Failed to fetch booking counts');
  }
};

/**
 * Check date availability
 */
const checkDateAvailability = async (req, res) => {
  try {
    const { date } = req.params;

    if (!date) {
      return sendBadRequest(res, 'Date is required');
    }

    // Validate date format (L6 fix)
    if (!isValidDateFormat(date)) {
      return sendBadRequest(res, 'Date must be in YYYY-MM-DD format');
    }

    const availability = await dbService.isDateAvailable(date);

    return sendSuccess(res, { date, ...availability }, 'Availability checked');
  } catch (error) {
    logger.error('Check availability error', { error: error.message, requestId: req.id });
    return sendError(res, 'Failed to check availability');
  }
};

/**
 * Validate booking date
 */
const validateBookingDate = async (req, res) => {
  try {
    const { bookingDate } = req.body;

    if (!bookingDate) {
      return sendBadRequest(res, 'Booking date is required');
    }

    // Validate date format (L6 fix)
    if (!isValidDateFormat(bookingDate)) {
      return sendBadRequest(res, 'Date must be in YYYY-MM-DD format');
    }

    const validation = await dbService.validateBookingDate(bookingDate);

    if (!validation.valid) {
      return res.status(HTTP.BAD_REQUEST).json({
        success: false,
        ...validation
      });
    }

    return sendSuccess(res, validation, 'Date is valid');
  } catch (error) {
    logger.error('Validate booking date error', { error: error.message, requestId: req.id });
    return sendError(res, 'Failed to validate booking date');
  }
};

module.exports = {
  createSubmission,
  getAllSubmissions,
  getSubmissionById,
  updateSubmission,
  deleteSubmission,
  searchSubmissions,
  getStatistics,
  exportSubmissions,
  getBookingCountsByDateRange,
  checkDateAvailability,
  validateBookingDate
};
