/**
 * Request Timeout Middleware (M17 fix)
 * Prevents long-running requests from hanging
 */

const { REQUEST } = require('../config/constants');
const logger = require('../utils/logger');

const timeoutMiddleware = (timeout = REQUEST.TIMEOUT_MS) => {
  return (req, res, next) => {
    // Set timeout
    req.setTimeout(timeout, () => {
      logger.warn('Request timeout', {
        requestId: req.id,
        method: req.method,
        path: req.path,
        timeout: `${timeout}ms`
      });

      if (!res.headersSent) {
        res.status(503).json({
          success: false,
          message: 'Request timeout - please try again',
          timestamp: new Date().toISOString()
        });
      }
    });

    next();
  };
};

module.exports = timeoutMiddleware;
