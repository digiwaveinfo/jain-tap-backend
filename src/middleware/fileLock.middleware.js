const lockfile = require('proper-lockfile');
const excelConfig = require('../config/excel.config');

/**
 * Wrapper function to execute operations with file locking
 * Prevents concurrent write conflicts on Excel file
 *
 * @param {Function} operation - Async operation to perform on the Excel file
 * @returns {Promise} Result of the operation
 */
async function withFileLock(operation) {
  let release;
  const filePath = excelConfig.excelFilePath;

  try {
    // Acquire lock with retry mechanism
    release = await lockfile.lock(filePath, excelConfig.lockOptions);

    // Perform the operation
    const result = await operation();

    return result;
  } catch (error) {
    if (error.code === 'ELOCKED') {
      throw new Error('File is currently locked by another process. Please try again in a moment.');
    }
    throw error;
  } finally {
    // Always release the lock
    if (release) {
      try {
        await release();
      } catch (releaseError) {
        console.error('Error releasing file lock:', releaseError);
      }
    }
  }
}

/**
 * Check if file is currently locked
 *
 * @returns {Promise<boolean>} True if file is locked
 */
async function isFileLocked() {
  try {
    const locked = await lockfile.check(excelConfig.excelFilePath);
    return locked;
  } catch (error) {
    console.error('Error checking file lock status:', error);
    return false;
  }
}

module.exports = {
  withFileLock,
  isFileLocked
};
