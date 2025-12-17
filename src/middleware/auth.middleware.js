const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

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
    expiresIn: process.env.JWT_EXPIRE || '7d'
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
 * Admin authentication with bcrypt password hashing
 * Password is stored as bcrypt hash in environment variables for security
 */
const authenticateAdmin = async (username, password) => {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

  // Validate username
  if (username !== adminUsername) {
    return {
      success: false,
      message: 'Invalid credentials'
    };
  }

  // Validate password using bcrypt comparison
  const isPasswordValid = await comparePassword(password, adminPasswordHash);

  if (isPasswordValid) {
    return {
      success: true,
      user: {
        username: adminUsername,
        role: 'admin'
      }
    };
  }

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
  authenticateAdmin
};
