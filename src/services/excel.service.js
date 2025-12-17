const ExcelJS = require('exceljs');
const fs = require('fs').promises;
const path = require('path');
const excelConfig = require('../config/excel.config');
const { withFileLock } = require('../middleware/fileLock.middleware');
const { generateSubmissionId } = require('../utils/helpers');

class ExcelService {
  constructor() {
    this.filePath = excelConfig.excelFilePath;
    this.columns = excelConfig.columns;
  }

  /**
   * Initialize Excel file with proper structure
   * Creates the file if it doesn't exist
   */
  async initializeFile() {
    try {
      // Check if file already exists
      try {
        await fs.access(this.filePath);
        console.log('✓ Excel file already exists');
        return;
      } catch {
        // File doesn't exist, create it
      }

      const workbook = new ExcelJS.Workbook();

      // Sheet 1: Submissions
      const submissionsSheet = workbook.addWorksheet('Submissions');
      submissionsSheet.columns = this.columns;

      // Style header row
      submissionsSheet.getRow(1).font = { bold: true, size: 11 };
      submissionsSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
      submissionsSheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

      // Sheet 2: Summary (for analytics)
      const summarySheet = workbook.addWorksheet('Summary');
      summarySheet.columns = [
        { header: 'Metric', key: 'metric', width: 30 },
        { header: 'Value', key: 'value', width: 20 }
      ];

      summarySheet.addRow({ metric: 'Total Submissions', value: 0 });
      summarySheet.addRow({ metric: 'Last Updated', value: new Date().toISOString() });

      summarySheet.getRow(1).font = { bold: true };

      // Save file
      await workbook.xlsx.writeFile(this.filePath);
      console.log('✓ Excel file initialized successfully at:', this.filePath);
    } catch (error) {
      console.error('Error initializing Excel file:', error);
      throw error;
    }
  }

  /**
   * Add new submission to Excel file
   *
   * @param {Object} data - Submission data
   * @returns {Promise<Object>} Created submission with ID
   */
  async addSubmission(data) {
    return await withFileLock(async () => {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(this.filePath);
      const worksheet = workbook.getWorksheet('Submissions');

      const id = generateSubmissionId();
      const submissionData = {
        id,
        submissionDate: new Date(),
        bookingDate: data.bookingDate ? new Date(data.bookingDate) : null,
        name: data.name,
        upiNumber: data.upiNumber,
        whatsappNumber: data.whatsappNumber,
        ayambilShalaName: data.ayambilShalaName,
        city: data.city,
        status: 'pending',
        ipAddress: data.ipAddress || ''
      };

      // Add a new row with values in correct column order
      worksheet.addRow([
        submissionData.id,                 // Column 1: ID
        submissionData.submissionDate,      // Column 2: Submission Date
        submissionData.bookingDate,         // Column 3: Booking Date
        submissionData.name,                // Column 4: Name
        submissionData.upiNumber,           // Column 5: UPI Number
        submissionData.whatsappNumber,      // Column 6: WhatsApp Number
        submissionData.ayambilShalaName,    // Column 7: Ayambil Shala Name
        submissionData.city,                // Column 8: City
        submissionData.status,              // Column 9: Status
        submissionData.ipAddress            // Column 10: IP Address
      ]);

      // Update summary
      const summarySheet = workbook.getWorksheet('Summary');
      if (summarySheet) {
        const totalRow = summarySheet.getRow(2);
        const currentTotal = totalRow.getCell(2).value || 0;
        totalRow.getCell(2).value = parseInt(currentTotal) + 1;

        const lastUpdatedRow = summarySheet.getRow(3);
        lastUpdatedRow.getCell(2).value = new Date().toISOString();
      }

      await workbook.xlsx.writeFile(this.filePath);

      return {
        success: true,
        id,
        message: 'તમારો ફોર્મ સફળતાપૂર્વક સબમિટ થયો છે (Your form has been submitted successfully)',
        data: submissionData
      };
    });
  }

  /**
   * Get all submissions with optional filters
   *
   * @param {Object} filters - Filter options (status, city, state, etc.)
   * @returns {Promise<Array>} Array of submissions
   */
  async getAllSubmissions(filters = {}) {
    return await withFileLock(async () => {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(this.filePath);
      const worksheet = workbook.getWorksheet('Submissions');

      const submissions = [];

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) { // Skip header
          const submission = {
            id: row.getCell(1).value,
            submissionDate: row.getCell(2).value,
            bookingDate: row.getCell(3).value,
            name: row.getCell(4).value,
            upiNumber: row.getCell(5).value,
            whatsappNumber: row.getCell(6).value,
            ayambilShalaName: row.getCell(7).value,
            city: row.getCell(8).value,
            status: row.getCell(9).value,
            ipAddress: row.getCell(10).value
          };

          // Apply filters
          let matches = true;
          if (filters.status && submission.status !== filters.status) matches = false;
          if (filters.city && submission.city !== filters.city) matches = false;

          if (matches) {
            submissions.push(submission);
          }
        }
      });

      // Sort by date (newest first)
      submissions.sort((a, b) => new Date(b.submissionDate) - new Date(a.submissionDate));

      return submissions;
    });
  }

  /**
   * Get submission by ID
   *
   * @param {string} id - Submission ID
   * @returns {Promise<Object|null>} Submission object or null
   */
  async getSubmissionById(id) {
    const submissions = await this.getAllSubmissions();
    return submissions.find(s => s.id === id) || null;
  }

  /**
   * Update submission
   *
   * @param {string} id - Submission ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Update result
   */
  async updateSubmission(id, updates) {
    return await withFileLock(async () => {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(this.filePath);
      const worksheet = workbook.getWorksheet('Submissions');

      let updated = false;
      let updatedSubmission = null;

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1 && row.getCell(1).value === id) {
          // Update allowed fields
          if (updates.status) row.getCell(9).value = updates.status;
          if (updates.bookingDate) row.getCell(3).value = new Date(updates.bookingDate);
          if (updates.name) row.getCell(4).value = updates.name;
          if (updates.upiNumber) row.getCell(5).value = updates.upiNumber;
          if (updates.whatsappNumber) row.getCell(6).value = updates.whatsappNumber;
          if (updates.ayambilShalaName) row.getCell(7).value = updates.ayambilShalaName;
          if (updates.city) row.getCell(8).value = updates.city;

          updated = true;
          updatedSubmission = {
            id: row.getCell(1).value,
            submissionDate: row.getCell(2).value,
            bookingDate: row.getCell(3).value,
            name: row.getCell(4).value,
            upiNumber: row.getCell(5).value,
            whatsappNumber: row.getCell(6).value,
            ayambilShalaName: row.getCell(7).value,
            city: row.getCell(8).value,
            status: row.getCell(9).value,
            ipAddress: row.getCell(10).value
          };
        }
      });

      if (!updated) {
        throw new Error('Submission not found');
      }

      await workbook.xlsx.writeFile(this.filePath);

      return {
        success: true,
        message: 'Submission updated successfully',
        data: updatedSubmission
      };
    });
  }

  /**
   * Delete submission by ID
   *
   * @param {string} id - Submission ID
   * @returns {Promise<Object>} Delete result
   */
  async deleteSubmission(id) {
    return await withFileLock(async () => {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(this.filePath);
      const worksheet = workbook.getWorksheet('Submissions');

      let rowToDelete = null;

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1 && row.getCell(1).value === id) {
          rowToDelete = rowNumber;
        }
      });

      if (!rowToDelete) {
        throw new Error('Submission not found');
      }

      worksheet.spliceRows(rowToDelete, 1);

      // Update summary
      const summarySheet = workbook.getWorksheet('Summary');
      if (summarySheet) {
        const totalRow = summarySheet.getRow(2);
        const currentTotal = totalRow.getCell(2).value || 0;
        totalRow.getCell(2).value = Math.max(0, parseInt(currentTotal) - 1);

        const lastUpdatedRow = summarySheet.getRow(3);
        lastUpdatedRow.getCell(2).value = new Date().toISOString();
      }

      await workbook.xlsx.writeFile(this.filePath);

      return {
        success: true,
        message: 'Submission deleted successfully'
      };
    });
  }

  /**
   * Search submissions by query
   *
   * @param {string} query - Search query
   * @returns {Promise<Array>} Matching submissions
   */
  async searchSubmissions(query) {
    const allSubmissions = await this.getAllSubmissions();
    const lowerQuery = query.toLowerCase();

    return allSubmissions.filter(submission => {
      return (
        submission.name?.toLowerCase().includes(lowerQuery) ||
        submission.upiNumber?.includes(query) ||
        submission.whatsappNumber?.includes(query) ||
        submission.ayambilShalaName?.toLowerCase().includes(lowerQuery) ||
        submission.city?.toLowerCase().includes(lowerQuery) ||
        submission.id?.toLowerCase().includes(lowerQuery)
      );
    });
  }

  /**
   * Get statistics
   *
   * @returns {Promise<Object>} Statistics object
   */
  async getStatistics() {
    const submissions = await this.getAllSubmissions();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaySubmissions = submissions.filter(s => {
      const subDate = new Date(s.submissionDate);
      subDate.setHours(0, 0, 0, 0);
      return subDate.getTime() === today.getTime();
    });

    const stats = await fs.stat(this.filePath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    return {
      total: submissions.length,
      today: todaySubmissions.length,
      pending: submissions.filter(s => s.status === 'pending').length,
      reviewed: submissions.filter(s => s.status === 'reviewed').length,
      archived: submissions.filter(s => s.status === 'archived').length,
      fileSizeMB: parseFloat(fileSizeMB)
    };
  }

  /**
   * Format date to DD/MM/YYYY string
   * @param {Date|string} date - Date to format
   * @returns {string} Formatted date string
   */
  formatDateDDMMYYYY(date) {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  /**
   * Export submissions to Excel file
   *
   * @param {Object} filters - Filter options
   * @returns {Promise<string>} Path to exported file
   */
  async exportSubmissions(filters = {}) {
    const submissions = await this.getAllSubmissions(filters);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Submissions Export');

    worksheet.columns = this.columns;

    // Style header
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add data with proper date formatting (DD/MM/YYYY)
    submissions.forEach(submission => {
      worksheet.addRow([
        submission.id,
        this.formatDateDDMMYYYY(submission.submissionDate),
        this.formatDateDDMMYYYY(submission.bookingDate),
        submission.name,
        submission.upiNumber,
        submission.whatsappNumber,
        submission.ayambilShalaName,
        submission.city,
        submission.status,
        submission.ipAddress
      ]);
    });

    // Ensure export directory exists
    try {
      await fs.access(excelConfig.exportDir);
    } catch {
      await fs.mkdir(excelConfig.exportDir, { recursive: true });
    }

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const exportPath = path.join(excelConfig.exportDir, `export_${timestamp}_${Date.now()}.xlsx`);

    await workbook.xlsx.writeFile(exportPath);

    return exportPath;
  }

  /**
   * Get booking counts for a date range
   *
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Object>} Object with date strings as keys and counts as values
   */
  async getBookingCountsByDateRange(startDate, endDate) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(this.filePath);
    const worksheet = workbook.getWorksheet('Submissions');

    const bookingCounts = {};

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header

      const bookingDate = row.getCell(3).value; // Column 3 is Booking Date

      if (bookingDate) {
        const date = new Date(bookingDate);
        // Only count if within range and status is not archived
        const status = row.getCell(9).value; // Column 9 is Status

        if (date >= startDate && date <= endDate && status !== 'archived') {
          const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format
          bookingCounts[dateStr] = (bookingCounts[dateStr] || 0) + 1;
        }
      }
    });

    return bookingCounts;
  }

  /**
   * Get booking count for a specific date
   *
   * @param {Date|string} date - Date to check
   * @returns {Promise<number>} Number of bookings for that date
   */
  async getBookingCountForDate(date) {
    const targetDate = new Date(date);
    const dateStr = targetDate.toISOString().split('T')[0];

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(this.filePath);
    const worksheet = workbook.getWorksheet('Submissions');

    let count = 0;

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header

      const bookingDate = row.getCell(3).value; // Column 3 is Booking Date
      const status = row.getCell(9).value; // Column 9 is Status

      if (bookingDate && status !== 'archived') {
        const rowDateStr = new Date(bookingDate).toISOString().split('T')[0];
        if (rowDateStr === dateStr) {
          count++;
        }
      }
    });

    return count;
  }

  /**
   * Check if a date is available for booking
   *
   * @param {Date|string} date - Date to check
   * @returns {Promise<Object>} Object with available flag and current count
   */
  async isDateAvailable(date) {
    const count = await this.getBookingCountForDate(date);
    const maxBookings = excelConfig.maxBookingsPerDay;

    return {
      available: count < maxBookings,
      count,
      maxBookings,
      remaining: maxBookings - count
    };
  }

  /**
   * Find next available date starting from a given date
   *
   * @param {Date|string} startDate - Date to start searching from
   * @param {number} maxDaysToSearch - Maximum days to search ahead (default 90)
   * @returns {Promise<Object>} Next available date info or null
   */
  async getNextAvailableDate(startDate, maxDaysToSearch = 90) {
    const searchStart = new Date(startDate);
    searchStart.setHours(0, 0, 0, 0);

    for (let i = 0; i < maxDaysToSearch; i++) {
      const checkDate = new Date(searchStart);
      checkDate.setDate(checkDate.getDate() + i);

      const availability = await this.isDateAvailable(checkDate);

      if (availability.available) {
        return {
          date: checkDate.toISOString().split('T')[0],
          count: availability.count,
          remaining: availability.remaining
        };
      }
    }

    return null; // No available date found in range
  }

  /**
   * Validate booking date before submission
   *
   * @param {Date|string} bookingDate - Date to validate
   * @returns {Promise<Object>} Validation result
   */
  async validateBookingDate(bookingDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const targetDate = new Date(bookingDate);
    targetDate.setHours(0, 0, 0, 0);

    // Check if date is in the past
    if (targetDate < today) {
      return {
        valid: false,
        error: 'Past dates cannot be booked',
        errorGu: 'પાછલી તારીખો બુક કરી શકાતી નથી'
      };
    }

    // Check availability
    const availability = await this.isDateAvailable(bookingDate);

    if (!availability.available) {
      const nextDate = await this.getNextAvailableDate(targetDate);

      return {
        valid: false,
        error: `This date is fully booked (${availability.count}/${availability.maxBookings} bookings)`,
        errorGu: `આ તારીખ સંપૂર્ણ બુક છે (${availability.count}/${availability.maxBookings} બુકિંગ)`,
        currentCount: availability.count,
        nextAvailableDate: nextDate
      };
    }

    return {
      valid: true,
      count: availability.count,
      remaining: availability.remaining
    };
  }
}

module.exports = new ExcelService();
