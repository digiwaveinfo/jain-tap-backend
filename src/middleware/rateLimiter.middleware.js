/**
 * Rate Limiting Middleware (C1 fix)
 * Prevents brute force and DoS attacks
 */

const rateLimit = require('express-rate-limit');
const { RATE_LIMIT } = require('../config/constants');
const logger = require('../utils/logger');

/**
 * Rate limiter for login attempts
 * Prevents brute force attacks
 */
const loginLimiter = rateLimit({
  windowMs: RATE_LIMIT.LOGIN_WINDOW_MS,
  max: RATE_LIMIT.LOGIN_MAX_ATTEMPTS,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: (req, res, next, options) => {
    logger.warn('Rate limit exceeded - login', { 
      ip: req.ip,
      requestId: req.id 
    });
    res.status(429).json(options.message);
  }
});

/**
 * Rate limiter for form submissions
 * Prevents spam submissions
 */
const submissionLimiter = rateLimit({
  windowMs: RATE_LIMIT.SUBMISSION_WINDOW_MS,
  max: RATE_LIMIT.SUBMISSION_MAX_ATTEMPTS,
  message: {
    success: false,
    message: 'Too many submissions. Please try again after 1 hour.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn('Rate limit exceeded - submission', { 
      ip: req.ip,
      requestId: req.id 
    });
    res.status(429).json(options.message);
  }
});

/**
 * General API rate limiter
 * Prevents DoS attacks
 */
const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT.API_WINDOW_MS,
  max: RATE_LIMIT.API_MAX_REQUESTS,
  message: {
    success: false,
    message: 'Too many requests. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn('Rate limit exceeded - API', { 
      ip: req.ip,
      path: req.path,
      requestId: req.id 
    });
    res.status(429).json(options.message);
  }
});

module.exports = {
  loginLimiter,
  submissionLimiter,
  apiLimiter
};
