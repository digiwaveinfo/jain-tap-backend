/**
 * Request ID Middleware (M18 fix)
 * Adds unique request ID for tracing and debugging
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

const requestIdMiddleware = (req, res, next) => {
  // Use existing request ID from header or generate new one
  req.id = req.headers['x-request-id'] || uuidv4();
  req.startTime = Date.now();

  // Set response header
  res.setHeader('X-Request-ID', req.id);

  // Log incoming request
  logger.info('Incoming request', {
    requestId: req.id,
    method: req.method,
    path: req.path,
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('user-agent')
  });

  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
    
    logger[logLevel]('Request completed', {
      requestId: req.id,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });
  });

  next();
};

module.exports = requestIdMiddleware;
