require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

// Import utilities and config
const logger = require('./utils/logger');
const { REQUEST, JWT } = require('./config/constants');

// Import middleware
const requestIdMiddleware = require('./middleware/requestId.middleware');
const timeoutMiddleware = require('./middleware/timeout.middleware');

// Import routes
const submissionRoutes = require('./routes/submission.routes');
const adminRoutes = require('./routes/admin.routes');
const anumodanaRoutes = require('./routes/anumodana.routes');
const calendarRoutes = require('./routes/calendar.routes');

// Import services
const dbService = require('./services/db.service');
const backupService = require('./services/backup.service');
const monitorService = require('./services/monitor.service');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// ===== Security Validations (H2 fix) =====
if (process.env.NODE_ENV === 'production') {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < JWT.MIN_SECRET_LENGTH) {
    logger.error('JWT_SECRET must be at least 32 characters in production');
    process.exit(1);
  }
  if (jwtSecret.includes('change-this') || jwtSecret.includes('secret-key') || jwtSecret.includes('your-secret')) {
    logger.error('Default JWT_SECRET detected. Use a strong random secret.');
    process.exit(1);
  }
}

// ===== Middleware Setup =====

// Request ID tracking (M18 fix)
app.use(requestIdMiddleware);

// Request timeout (M17 fix)
app.use(timeoutMiddleware());

// Security headers with HSTS (H3 fix)
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  }
}));

// CORS configuration (M1 fix - stricter origin validation)
const corsOptions = {
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }
    
    const allowedOrigins = (process.env.CLIENT_URL)
      .split(',')
      .map(o => o.trim())
      .filter(Boolean);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked origin', { origin, allowedOrigins });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
};
app.use(cors(corsOptions));

// Body parser with reduced limits (L1 fix)
app.use(express.json({ limit: REQUEST.MAX_JSON_SIZE }));
app.use(express.urlencoded({ extended: true, limit: REQUEST.MAX_URL_ENCODED_SIZE }));

// ===== Routes =====

// API Routes
app.use('/api/submissions', submissionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/anumodana', anumodanaRoutes);
app.use('/api/calendar', calendarRoutes);

// Serve static files with CORS headers
app.use('/uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, '../uploads')));

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'વિહાર રક્ષા તપ API Server',
    version: '1.0.0',
    endpoints: {
      public: [
        'POST /api/submissions - Submit form',
        'GET /api/admin/health - Health check'
      ],
      protected: [
        'POST /api/admin/login - Admin login',
        'GET /api/submissions - Get all submissions',
        'GET /api/submissions/stats - Get statistics',
        'GET /api/submissions/search?q=query - Search submissions',
        'GET /api/submissions/export - Export submissions',
        'GET /api/submissions/:id - Get submission by ID',
        'PUT /api/submissions/:id - Update submission',
        'DELETE /api/submissions/:id - Delete submission',
        'GET /api/admin/backups - List backups',
        'POST /api/admin/backups - Create backup',
        'POST /api/admin/backups/restore - Restore backup',
        'POST /api/admin/archive - Archive old records'
      ]
    }
  });
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const health = await monitorService.getHealthCheck();
    res.json(health);
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ===== Error Handling =====

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.path,
    timestamp: new Date().toISOString()
  });
});

// Global error handler (M5 fix - no stack traces in production)
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    requestId: req.id,
    error: err.message,
    stack: err.stack,
    path: req.path
  });

  // Don't expose error details in production
  const response = {
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    timestamp: new Date().toISOString()
  };

  res.status(err.status || 500).json(response);
});

// ===== Server Initialization =====

async function startServer() {
  try {
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('  વિહાર રક્ષા તપ - Server Starting...  ');
    logger.info('═══════════════════════════════════════════════════════');

    // Initialize Database
    logger.info('Initializing Database...');
    await dbService.initializeDatabase();

    // Schedule automatic backups
    logger.info('Setting up backup system...');
    backupService.scheduleAutoBackup();

    // Perform initial health check
    logger.info('Performing health check...');
    const health = await monitorService.getHealthCheck();
    logger.info(`Health Status: ${health.status.toUpperCase()}`, {
      fileSize: `${health.file?.sizeMB || 0} MB`,
      rowCount: health.file?.rowCount || 0,
      backups: health.backup?.backupCount || 0
    });

    if (health.warnings && health.warnings.length > 0) {
      health.warnings.forEach(warning => logger.warn(warning));
    }

    // Start listening
    app.listen(PORT, () => {
      logger.info('═══════════════════════════════════════════════════════');
      logger.info(`Server running successfully!`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Port: ${PORT}`);
      logger.info(`API: http://localhost:${PORT}`);
      logger.info(`Health: http://localhost:${PORT}/api/health`);
      logger.info('═══════════════════════════════════════════════════════');
      logger.info('🙏 જય જિનેન્દ્ર!');
    });

  } catch (error) {
    logger.error('Server startup failed', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.warn('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.warn('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason: reason?.message || reason });
});

// Start the server
startServer();

module.exports = app;
