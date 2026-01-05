const { authenticateAdmin, generateToken } = require('../middleware/auth.middleware');
const monitorService = require('../services/monitor.service');
const backupService = require('../services/backup.service');
const dbService = require('../services/db.service');
const logger = require('../utils/logger');
const { sendSuccess, sendError, sendBadRequest, sendUnauthorized } = require('../utils/response');
const { HTTP } = require('../config/constants');

/**
 * Admin login
 */
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return sendBadRequest(res, 'Username and password are required');
    }

    const authResult = await authenticateAdmin(username, password);

    if (!authResult.success) {
      return sendUnauthorized(res, 'Invalid credentials');
    }

    const token = generateToken({
      username: authResult.user.username,
      role: authResult.user.role
    });

    logger.info('Admin login successful', { username, requestId: req.id });

    return sendSuccess(res, {
      token,
      user: authResult.user
    }, 'Login successful');
  } catch (error) {
    logger.error('Login error', { error: error.message, requestId: req.id });
    return sendError(res, 'Login failed');
  }
};

/**
 * Get system health
 */
const getHealth = async (req, res) => {
  try {
    const health = await monitorService.getHealthCheck();

    const statusCode = health.status === 'healthy' ? HTTP.OK :
      health.status === 'warning' ? HTTP.OK :
        health.status === 'critical' ? HTTP.SERVICE_UNAVAILABLE : HTTP.INTERNAL_ERROR;

    res.status(statusCode).json({
      success: true,
      ...health
    });
  } catch (error) {
    logger.error('Health check error', { error: error.message, requestId: req.id });
    return sendError(res, 'Health check failed');
  }
};

/**
 * Get backups list
 */
const getBackups = async (req, res) => {
  try {
    const backups = await backupService.listBackups();

    return sendSuccess(res, backups, `Found ${backups.length} backups`);
  } catch (error) {
    logger.error('Get backups error', { error: error.message, requestId: req.id });
    return sendError(res, 'Failed to list backups');
  }
};

/**
 * Create manual backup
 */
const createBackup = async (req, res) => {
  try {
    const backupPath = await backupService.createBackup();

    logger.info('Manual backup created', { backupPath, requestId: req.id });
    return sendSuccess(res, { backupPath }, 'Backup created successfully');
  } catch (error) {
    logger.error('Create backup error', { error: error.message, requestId: req.id });
    return sendError(res, 'Backup creation failed');
  }
};

/**
 * Restore from backup
 */
const restoreBackup = async (req, res) => {
  try {
    const { backupFileName } = req.body;

    if (!backupFileName) {
      return sendBadRequest(res, 'Backup file name is required');
    }

    const result = await backupService.restoreFromBackup(backupFileName);

    logger.info('Backup restored', { backupFileName, requestId: req.id });
    return sendSuccess(res, result, result.message);
  } catch (error) {
    logger.error('Restore backup error', { error: error.message, requestId: req.id });
    return sendError(res, 'Restore failed');
  }
};

/**
 * Archive old records
 */
const archiveRecords = async (req, res) => {
  try {
    const { monthsOld = 6 } = req.body;

    const months = Math.max(1, Math.min(24, parseInt(monthsOld) || 6));
    const result = await monitorService.archiveOldRecords(months);

    logger.info('Records archived', { 
      monthsOld: months, 
      archivedCount: result.archivedCount,
      requestId: req.id 
    });
    return sendSuccess(res, result, result.message);
  } catch (error) {
    logger.error('Archive records error', { error: error.message, requestId: req.id });
    return sendError(res, 'Archive failed');
  }
};

/**
 * Get system settings
 */
const getSettings = async (req, res) => {
  try {
    const maxBookingsPerDay = await dbService.getSetting('max_bookings_per_day', '3');
    const maxBookingsPerMonth = await dbService.getSetting('max_bookings_per_month', '1000');

    return sendSuccess(res, {
      maxBookingsPerDay: parseInt(maxBookingsPerDay, 10),
      maxBookingsPerMonth: parseInt(maxBookingsPerMonth, 10)
    }, 'Settings retrieved');
  } catch (error) {
    logger.error('Get settings error', { error: error.message, requestId: req.id });
    return sendError(res, 'Failed to get settings');
  }
};

/**
 * Update system settings
 */
const updateSettings = async (req, res) => {
  try {
    const { maxBookingsPerDay, maxBookingsPerMonth } = req.body;

    if (maxBookingsPerDay !== undefined) {
      const value = Math.max(1, Math.min(100, parseInt(maxBookingsPerDay) || 3));
      await dbService.setSetting('max_bookings_per_day', value);
    }

    if (maxBookingsPerMonth !== undefined) {
      const value = Math.max(1, Math.min(10000, parseInt(maxBookingsPerMonth) || 1000));
      await dbService.setSetting('max_bookings_per_month', value);
    }

    logger.info('Settings updated', { maxBookingsPerDay, maxBookingsPerMonth, requestId: req.id });
    return sendSuccess(res, null, 'Settings updated successfully');
  } catch (error) {
    logger.error('Update settings error', { error: error.message, requestId: req.id });
    return sendError(res, 'Failed to update settings');
  }
};

module.exports = {
  login,
  getHealth,
  getBackups,
  createBackup,
  restoreBackup,
  archiveRecords,
  getSettings,
  updateSettings
};
