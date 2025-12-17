const excelService = require('../services/excel.service');
const backupService = require('../services/backup.service');
const emailService = require('../services/email.service');
const { getClientIp, paginate } = require('../utils/helpers');

/**
 * Create new submission
 */
const createSubmission = async (req, res) => {
  try {
    // Validate booking date if provided
    if (req.body.bookingDate) {
      const validation = await excelService.validateBookingDate(req.body.bookingDate);

      if (!validation.valid) {
        return res.status(400).json({
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

    // Add submission to Excel
    const result = await excelService.addSubmission(submissionData);

    // Send confirmation email (if enabled and email provided)
    if (submissionData.email) {
      emailService.sendSubmissionConfirmation({
        ...submissionData,
        id: result.id,
        date: result.data.date
      }).catch(err => {
        console.error('Email send failed (non-blocking):', err.message);
      });
    }

    res.status(201).json(result);
  } catch (error) {
    console.error('Create submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit form. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all submissions (Admin only)
 */
const getAllSubmissions = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, city, state } = req.query;

    // Build filters
    const filters = {};
    if (status) filters.status = status;
    if (city) filters.city = city;
    if (state) filters.state = state;

    // Get submissions
    const submissions = await excelService.getAllSubmissions(filters);

    // Paginate
    const paginatedResult = paginate(submissions, parseInt(page), parseInt(limit));

    res.json({
      success: true,
      ...paginatedResult
    });
  } catch (error) {
    console.error('Get submissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch submissions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get submission by ID (Admin only)
 */
const getSubmissionById = async (req, res) => {
  try {
    const { id } = req.params;
    const submission = await excelService.getSubmissionById(id);

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    res.json({
      success: true,
      data: submission
    });
  } catch (error) {
    console.error('Get submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch submission',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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

    const result = await excelService.updateSubmission(id, req.body);

    res.json(result);
  } catch (error) {
    console.error('Update submission error:', error);

    if (error.message === 'Submission not found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update submission',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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

    const result = await excelService.deleteSubmission(id);

    res.json(result);
  } catch (error) {
    console.error('Delete submission error:', error);

    if (error.message === 'Submission not found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to delete submission',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Search submissions (Admin only)
 */
const searchSubmissions = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters'
      });
    }

    const results = await excelService.searchSubmissions(q);

    res.json({
      success: true,
      data: results,
      count: results.length
    });
  } catch (error) {
    console.error('Search submissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get statistics (Admin only)
 */
const getStatistics = async (req, res) => {
  try {
    const stats = await excelService.getStatistics();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Export submissions (Admin only)
 */
const exportSubmissions = async (req, res) => {
  try {
    const { status, city, state } = req.query;

    // Build filters
    const filters = {};
    if (status) filters.status = status;
    if (city) filters.city = city;
    if (state) filters.state = state;

    const exportPath = await excelService.exportSubmissions(filters);

    res.download(exportPath, `submissions_export_${Date.now()}.xlsx`, (err) => {
      if (err) {
        console.error('Download error:', err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: 'Failed to download export file'
          });
        }
      }
    });
  } catch (error) {
    console.error('Export submissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Export failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get booking counts for date range
 */
const getBookingCountsByDateRange = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate are required'
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    const bookingCounts = await excelService.getBookingCountsByDateRange(start, end);

    res.json({
      success: true,
      bookingCounts,
      maxBookingsPerDay: 3
    });
  } catch (error) {
    console.error('Get booking counts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking counts',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Check date availability
 */
const checkDateAvailability = async (req, res) => {
  try {
    const { date } = req.params;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required'
      });
    }

    const availability = await excelService.isDateAvailable(date);

    res.json({
      success: true,
      date,
      ...availability
    });
  } catch (error) {
    console.error('Check availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check availability',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Validate booking date
 */
const validateBookingDate = async (req, res) => {
  try {
    const { bookingDate } = req.body;

    if (!bookingDate) {
      return res.status(400).json({
        success: false,
        message: 'Booking date is required'
      });
    }

    const validation = await excelService.validateBookingDate(bookingDate);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        ...validation
      });
    }

    res.json({
      success: true,
      ...validation
    });
  } catch (error) {
    console.error('Validate booking date error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate booking date',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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
