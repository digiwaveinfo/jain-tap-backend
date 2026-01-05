/**
 * Standardized API Response Helpers (H7 fix)
 * Ensures consistent response format across all endpoints
 */

const { HTTP } = require('../config/constants');

/**
 * Send success response
 */
const sendSuccess = (res, data = null, message = 'Success', statusCode = HTTP.OK) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  });
};

/**
 * Send error response
 */
const sendError = (res, message, statusCode = HTTP.INTERNAL_ERROR, error = null) => {
  const response = {
    success: false,
    message,
    timestamp: new Date().toISOString()
  };

  // Only include error details in development
  if (process.env.NODE_ENV === 'development' && error) {
    response.error = typeof error === 'string' ? error : error.message;
  }

  return res.status(statusCode).json(response);
};

/**
 * Send paginated response
 */
const sendPaginated = (res, data, pagination, message = 'Success') => {
  return res.status(HTTP.OK).json({
    success: true,
    message,
    data,
    pagination: {
      total: pagination.total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(pagination.total / pagination.limit),
      hasNext: pagination.page * pagination.limit < pagination.total,
      hasPrev: pagination.page > 1
    },
    timestamp: new Date().toISOString()
  });
};

/**
 * Send created response
 */
const sendCreated = (res, data, message = 'Created successfully') => {
  return sendSuccess(res, data, message, HTTP.CREATED);
};

/**
 * Send not found response
 */
const sendNotFound = (res, message = 'Resource not found') => {
  return sendError(res, message, HTTP.NOT_FOUND);
};

/**
 * Send bad request response
 */
const sendBadRequest = (res, message = 'Bad request') => {
  return sendError(res, message, HTTP.BAD_REQUEST);
};

/**
 * Send unauthorized response
 */
const sendUnauthorized = (res, message = 'Unauthorized') => {
  return sendError(res, message, HTTP.UNAUTHORIZED);
};

module.exports = {
  sendSuccess,
  sendError,
  sendPaginated,
  sendCreated,
  sendNotFound,
  sendBadRequest,
  sendUnauthorized
};
