require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

// Initialize Express app
const app = express();

// ===== Middleware Setup =====

// Security headers
app.use(helmet());

// CORS configuration - allow all origins for now
app.use(cors({
    origin: '*',
    credentials: true,
    optionsSuccessStatus: 200
}));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ===== Routes =====

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'વિહાર રક્ષા તપ API Server',
        version: '1.0.0',
        environment: 'Vercel Serverless',
        note: '⚠️ This is a serverless deployment. Excel file storage is not persistent on Vercel. Consider using a database for production.',
        endpoints: {
            public: [
                'POST /api/submissions - Submit form',
                'GET /api/health - Health check'
            ],
            protected: [
                'POST /api/admin/login - Admin login',
                'GET /api/submissions - Get all submissions'
            ]
        }
    });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: 'Vercel Serverless',
        note: 'Excel file storage not available in serverless mode'
    });
});

// Try to load full routes, with fallback
try {
    const submissionRoutes = require('../src/routes/submission.routes');
    const adminRoutes = require('../src/routes/admin.routes');

    app.use('/api/submissions', submissionRoutes);
    app.use('/api/admin', adminRoutes);
    console.log('Full routes loaded successfully');
} catch (error) {
    console.error('Could not load full routes:', error.message);

    // Fallback routes when Excel service is not available
    app.post('/api/submissions', (req, res) => {
        res.status(503).json({
            success: false,
            message: 'Submission service not available in serverless mode. Excel file storage requires a persistent server.',
            suggestion: 'Please deploy the backend on a VPS, Railway, or Render for full functionality.'
        });
    });

    app.get('/api/submissions', (req, res) => {
        res.status(503).json({
            success: false,
            message: 'Submission service not available in serverless mode.',
            suggestion: 'Please deploy the backend on a VPS, Railway, or Render for full functionality.'
        });
    });

    app.post('/api/admin/login', (req, res) => {
        const { username, password } = req.body;

        // Simple auth check using env variables
        if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
            res.json({
                success: true,
                message: 'Login successful (limited functionality)',
                note: 'Full admin features not available in serverless mode'
            });
        } else {
            res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }
    });

    app.get('/api/admin/health', (req, res) => {
        res.json({
            status: 'limited',
            message: 'Backend running in limited serverless mode',
            timestamp: new Date().toISOString()
        });
    });
}

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
        message: err.message || 'Internal server error'
    });
});

// Export the Express app for Vercel serverless
module.exports = app;
