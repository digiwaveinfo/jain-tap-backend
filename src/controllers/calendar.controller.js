const dbService = require('../services/db.service');
const logger = require('../utils/logger');
const { isValidDateFormat, validateDateRange } = require('../utils/helpers');
const { sendSuccess, sendError, sendBadRequest } = require('../utils/response');
const { BOOKING } = require('../config/constants');

// Valid status values (M11 fix)
const VALID_STATUSES = ['open', 'closed'];

/**
 * Get calendar settings / availability (Admin + Public)
 */
const getCalendarSettings = async (req, res) => {
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

    const settings = await dbService.getCalendarSettings(startDate, endDate);

    return sendSuccess(res, settings, 'Calendar settings retrieved');
  } catch (error) {
    logger.error('Get calendar settings error', { error: error.message, requestId: req.id });
    return sendError(res, 'Failed to fetch calendar settings');
  }
};

/**
 * Set date status (Admin only)
 */
const setDateStatus = async (req, res) => {
  try {
    const { date, status } = req.body;

    if (!date || !status) {
      return sendBadRequest(res, 'Date and status are required');
    }

    // Validate date format (L6 fix)
    if (!isValidDateFormat(date)) {
      return sendBadRequest(res, 'Date must be in YYYY-MM-DD format');
    }

    // Validate status value (M11 fix)
    if (!VALID_STATUSES.includes(status)) {
      return sendBadRequest(res, `Status must be one of: ${VALID_STATUSES.join(', ')}`);
    }

    const result = await dbService.setCalendarDateStatus(date, status);

    logger.info('Date status updated', { date, status, requestId: req.id });
    return sendSuccess(res, result, 'Date status updated');
  } catch (error) {
    logger.error('Set date status error', { error: error.message, requestId: req.id });
    return sendError(res, 'Failed to update date status');
  }
};

/**
 * Bulk update dates (Admin only)
 */
const bulkUpdateDates = async (req, res) => {
  try {
    const { updates } = req.body;

    if (!Array.isArray(updates)) {
      return sendBadRequest(res, 'updates must be an array');
    }

    if (updates.length > 100) {
      return sendBadRequest(res, 'Cannot update more than 100 dates at once');
    }

    const results = [];
    const errors = [];

    for (const update of updates) {
      // Validate each update
      if (!update.date || !update.status) {
        errors.push({ date: update.date, error: 'Missing date or status' });
        continue;
      }

      if (!isValidDateFormat(update.date)) {
        errors.push({ date: update.date, error: 'Invalid date format' });
        continue;
      }

      if (!VALID_STATUSES.includes(update.status)) {
        errors.push({ date: update.date, error: 'Invalid status' });
        continue;
      }

      await dbService.setCalendarDateStatus(update.date, update.status);
      results.push(update);
    }

    logger.info('Bulk dates updated', { 
      successCount: results.length, 
      errorCount: errors.length,
      requestId: req.id 
    });

    return sendSuccess(res, { 
      updated: results, 
      errors: errors.length > 0 ? errors : undefined 
    }, `Updated ${results.length} dates`);
  } catch (error) {
    logger.error('Bulk update error', { error: error.message, requestId: req.id });
    return sendError(res, 'Failed to update dates');
  }
};

module.exports = {
  getCalendarSettings,
  setDateStatus,
  bulkUpdateDates
};
