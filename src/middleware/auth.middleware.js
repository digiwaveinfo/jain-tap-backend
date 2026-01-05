const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');
const { JWT } = require('../config/constants');

/**
 * JWT authentication middleware
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access token required'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    logger.warn('Invalid token attempt', { 
      requestId: req.id,
      error: error.message 
    });
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

/**
 * Generate JWT token
 */
const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: JWT.EXPIRY
  });
};

/**
 * Hash password
 */
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
};

/**
 * Compare password
 */
const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

/**
 * Validate bcrypt hash format (M7 fix)
 */
const isValidBcryptHash = (hash) => {
  if (!hash || typeof hash !== 'string') return false;
  // Bcrypt hashes start with $2a$, $2b$, or $2y$ and are 60 characters
  return /^\$2[aby]\$\d{2}\$.{53}$/.test(hash);
};

/**
 * Admin authentication with bcrypt password hashing
 * Password is stored as bcrypt hash in environment variables for security
 */
const authenticateAdmin = async (username, password) => {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

  // Validate username
  if (username !== adminUsername) {
    logger.warn('Invalid admin login attempt - wrong username', { username });
    return {
      success: false,
      message: 'Invalid credentials'
    };
  }

  // Validate password hash exists and is valid format (M7 fix)
  if (!adminPasswordHash) {
    logger.error('ADMIN_PASSWORD_HASH not configured');
    return {
      success: false,
      message: 'Server configuration error'
    };
  }

  if (!isValidBcryptHash(adminPasswordHash)) {
    logger.error('ADMIN_PASSWORD_HASH is not a valid bcrypt hash');
    return {
      success: false,
      message: 'Server configuration error'
    };
  }

  // Validate password using bcrypt comparison
  try {
    const isPasswordValid = await comparePassword(password, adminPasswordHash);

    if (isPasswordValid) {
      logger.info('Admin login successful', { username });
      return {
        success: true,
        user: {
          username: adminUsername,
          role: 'admin'
        }
      };
    }
  } catch (error) {
    logger.error('Password comparison error', { error: error.message });
  }

  logger.warn('Invalid admin login attempt - wrong password', { username });
  return {
    success: false,
    message: 'Invalid credentials'
  };
};

module.exports = {
  authenticateToken,
  generateToken,
  hashPassword,
  comparePassword,
  authenticateAdmin,
  isValidBcryptHash
};
