const { authenticateAdmin, generateToken } = require('../middleware/auth.middleware');
const monitorService = require('../services/monitor.service');
const backupService = require('../services/backup.service');

/**
 * Admin login
 */
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    const authResult = await authenticateAdmin(username, password);

    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const token = generateToken({
      username: authResult.user.username,
      role: authResult.user.role
    });

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: authResult.user
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get system health
 */
const getHealth = async (req, res) => {
  try {
    const health = await monitorService.getHealthCheck();

    const statusCode = health.status === 'healthy' ? 200 :
                       health.status === 'warning' ? 200 :
                       health.status === 'critical' ? 503 : 500;

    res.status(statusCode).json({
      success: true,
      ...health
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      success: false,
      status: 'error',
      message: 'Health check failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get backups list
 */
const getBackups = async (req, res) => {
  try {
    const backups = await backupService.listBackups();

    res.json({
      success: true,
      data: backups,
      count: backups.length
    });
  } catch (error) {
    console.error('Get backups error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to list backups',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Create manual backup
 */
const createBackup = async (req, res) => {
  try {
    const backupPath = await backupService.createBackup();

    res.json({
      success: true,
      message: 'Backup created successfully',
      backupPath
    });
  } catch (error) {
    console.error('Create backup error:', error);
    res.status(500).json({
      success: false,
      message: 'Backup creation failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Restore from backup
 */
const restoreBackup = async (req, res) => {
  try {
    const { backupFileName } = req.body;

    if (!backupFileName) {
      return res.status(400).json({
        success: false,
        message: 'Backup file name is required'
      });
    }

    const result = await backupService.restoreFromBackup(backupFileName);

    res.json(result);
  } catch (error) {
    console.error('Restore backup error:', error);
    res.status(500).json({
      success: false,
      message: 'Restore failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Archive old records
 */
const archiveRecords = async (req, res) => {
  try {
    const { monthsOld = 6 } = req.body;

    const result = await monitorService.archiveOldRecords(parseInt(monthsOld));

    res.json(result);
  } catch (error) {
    console.error('Archive records error:', error);
    res.status(500).json({
      success: false,
      message: 'Archive failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  login,
  getHealth,
  getBackups,
  createBackup,
  restoreBackup,
  archiveRecords
};
