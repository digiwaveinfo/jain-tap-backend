require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

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

// ===== Middleware Setup =====

// Security headers
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting - prevent abuse (only in production)
if (process.env.NODE_ENV === 'production') {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
      success: false,
      message: 'Too many requests from this IP, please try again later.'
    }
  });

  // Apply rate limiting to all routes
  app.use('/api/', limiter);

  // Stricter rate limiting for form submissions
  const submissionLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Limit form submissions
    message: {
      success: false,
      message: 'તમે ખૂબ બધા ફોર્મ સબમિટ કર્યા છે. કૃપા કરીને થોડા સમય પછી પ્રયાસ કરો. (Too many form submissions. Please try again later.)'
    }
  });

  app.use('/api/submissions', submissionLimiter);
} else {
  console.log('⚠️  Rate limiting disabled in development mode');
}

// Request logging middleware (development only)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// ===== Routes =====

// API Routes
app.use('/api/submissions', submissionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/anumodana', anumodanaRoutes);
app.use('/api/calendar', calendarRoutes);

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

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
    path: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// ===== Server Initialization =====

async function startServer() {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  વિહાર રક્ષા તપ - Server Starting...  ');
    console.log('═══════════════════════════════════════════════════════');

    // Initialize Database
    console.log('\n📋 Initializing Database...');
    await dbService.initializeDatabase();

    // Schedule automatic backups
    console.log('\n💾 Setting up backup system...');
    backupService.scheduleAutoBackup();

    // Perform initial health check
    console.log('\n🏥 Performing health check...');
    const health = await monitorService.getHealthCheck();
    console.log(`   Status: ${health.status.toUpperCase()}`);
    console.log(`   File size: ${health.file?.sizeMB || 0} MB`);
    console.log(`   Row count: ${health.file?.rowCount || 0}`);
    console.log(`   Backups: ${health.backup?.backupCount || 0}`);

    if (health.warnings && health.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      health.warnings.forEach(warning => console.log(`   - ${warning}`));
    }

    // Start listening
    app.listen(PORT, () => {
      console.log('\n═══════════════════════════════════════════════════════');
      console.log(`✅ Server running successfully!`);
      console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`   Port: ${PORT}`);
      console.log(`   API: http://localhost:${PORT}`);
      console.log(`   Health: http://localhost:${PORT}/api/health`);
      console.log('═══════════════════════════════════════════════════════');
      console.log('\n🙏 જય જિનેન્દ્ર!\n');
    });

  } catch (error) {
    console.error('\n❌ Server startup failed:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n⚠️  SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n⚠️  SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

// Start the server
startServer();

module.exports = app;

