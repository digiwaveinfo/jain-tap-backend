const crypto = require('crypto');
const xss = require('xss');

/**
 * Generate unique submission ID
 * Format: VRT-{timestamp}-{random}
 *
 * @returns {string} Unique submission ID
 */
function generateSubmissionId() {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `VRT-${timestamp}-${random}`;
}

/**
 * Format date to Indian standard (DD/MM/YYYY HH:mm:ss)
 *
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

/**
 * Sanitize user input to prevent XSS
 * Uses xss library for proper sanitization
 *
 * @param {string} input - User input
 * @returns {string} Sanitized input
 */
function sanitizeInput(input) {
  if (typeof input !== 'string') return input;

  // Use xss library with strict options (no HTML allowed)
  return xss(input.trim(), {
    whiteList: {},          // No tags allowed
    stripIgnoreTag: true,   // Strip all tags
    stripIgnoreTagBody: ['script', 'style'] // Remove script/style content
  }).substring(0, 1000); // Limit length
}

/**
 * Validate mobile number (Indian format)
 *
 * @param {string} mobile - Mobile number
 * @returns {boolean} True if valid
 */
function isValidMobile(mobile) {
  const mobileRegex = /^[6-9]\d{9}$/;
  return mobileRegex.test(mobile);
}

/**
 * Validate email address
 *
 * @param {string} email - Email address
 * @returns {boolean} True if valid
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Get client IP address from request
 *
 * @param {Object} req - Express request object
 * @returns {string} IP address
 */
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         'unknown';
}

/**
 * Pagination helper
 *
 * @param {Array} items - Array to paginate
 * @param {number} page - Page number (1-indexed)
 * @param {number} limit - Items per page
 * @returns {Object} Paginated result with metadata
 */
function paginate(items, page = 1, limit = 50) {
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedItems = items.slice(startIndex, endIndex);

  return {
    data: paginatedItems,
    pagination: {
      total: items.length,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(items.length / limit),
      hasNext: endIndex < items.length,
      hasPrev: page > 1
    }
  };
}

/**
 * Validate date format (YYYY-MM-DD) (L6 fix)
 *
 * @param {string} dateString - Date string to validate
 * @returns {boolean} True if valid YYYY-MM-DD format
 */
function isValidDateFormat(dateString) {
  if (!dateString || typeof dateString !== 'string') return false;
  
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return false;
  
  // Ensure the date string matches what we'd get from the Date object
  return dateString === date.toISOString().split('T')[0];
}

/**
 * Validate date range is reasonable (M6 fix)
 *
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {number} maxDays - Maximum allowed days in range
 * @returns {Object} Validation result
 */
function validateDateRange(startDate, endDate, maxDays = 365) {
  if (!isValidDateFormat(startDate)) {
    return { valid: false, error: 'Invalid start date format. Use YYYY-MM-DD' };
  }
  if (!isValidDateFormat(endDate)) {
    return { valid: false, error: 'Invalid end date format. Use YYYY-MM-DD' };
  }
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (end < start) {
    return { valid: false, error: 'End date must be after start date' };
  }
  
  const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  if (diffDays > maxDays) {
    return { valid: false, error: `Date range cannot exceed ${maxDays} days` };
  }
  
  return { valid: true, diffDays };
}

module.exports = {
  generateSubmissionId,
  formatDate,
  sanitizeInput,
  isValidMobile,
  isValidEmail,
  getClientIp,
  paginate,
  isValidDateFormat,
  validateDateRange
};
