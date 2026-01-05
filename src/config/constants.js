/**
 * Application Constants (M13 fix)
 * Centralizes all magic numbers and configuration values
 */

module.exports = {
  // JWT Configuration
  JWT: {
    EXPIRY: process.env.JWT_EXPIRE || '1h',
    REFRESH_EXPIRY: '7d',
    MIN_SECRET_LENGTH: 32
  },

  // File Upload Configuration
  FILE: {
    MAX_UPLOAD_SIZE: 5 * 1024 * 1024, // 5MB
    ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
    ALLOWED_MIMETYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  },

  // Database Thresholds
  DATABASE: {
    MAX_ROWS_WARNING: 50000,
    MAX_ROWS_CRITICAL: 100000,
    MAX_FILE_SIZE_MB: 100,
    WARNING_FILE_SIZE_MB: 50
  },

  // Booking Limits
  BOOKING: {
    DEFAULT_MAX_PER_DAY: 3,
    DEFAULT_MAX_PER_MONTH: 1000,
    MAX_DATE_RANGE_DAYS: 365 // Maximum date range for queries
  },

  // Rate Limiting
  RATE_LIMIT: {
    LOGIN_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    LOGIN_MAX_ATTEMPTS: 5,
    SUBMISSION_WINDOW_MS: 60 * 60 * 1000, // 1 hour
    SUBMISSION_MAX_ATTEMPTS: 10,
    API_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    API_MAX_REQUESTS: 100
  },

  // Request Limits
  REQUEST: {
    MAX_JSON_SIZE: '1mb',
    MAX_URL_ENCODED_SIZE: '1mb',
    TIMEOUT_MS: 30000 // 30 seconds
  },

  // Backup Configuration
  BACKUP: {
    MAX_BACKUPS: 10,
    HOURS_WARNING: 24
  },

  // HTTP Status Codes
  HTTP: {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_ERROR: 500,
    SERVICE_UNAVAILABLE: 503
  }
};
