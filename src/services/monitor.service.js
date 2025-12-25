const fs = require('fs').promises;
const dbConfig = require('../config/db.config');
const backupService = require('./backup.service');
const dbService = require('./db.service');
// Reuse excel config for threshold values if needed, or defaults
const excelConfig = require('../config/excel.config');

class MonitorService {
  /**
   * Get comprehensive health check
   *
   * @returns {Promise<Object>} Health check results
   */
  async getHealthCheck() {
    try {
      const [stats, lastBackup, backups] = await Promise.all([
        dbService.getStatistics(),
        backupService.getLastBackupTime(),
        backupService.listBackups()
      ]);

      const fileSize = stats.fileSizeMB;
      const rowCount = stats.total;

      // Calculate health status
      let status = 'healthy';
      const warnings = [];

      // Define thresholds (reuse existing or set new ones for DB)
      const MAX_ROWS = 100000;
      const WARNING_ROWS = 50000;
      const MAX_SIZE_MB = 100;
      const WARNING_SIZE_MB = 50;

      if (fileSize > WARNING_SIZE_MB) {
        warnings.push(`File size is ${fileSize.toFixed(2)}MB (threshold: ${WARNING_SIZE_MB}MB)`);
      }

      if (rowCount > WARNING_ROWS) {
        warnings.push(`Row count is ${rowCount} (threshold: ${WARNING_ROWS})`);
      }

      if (lastBackup) {
        const hoursSinceBackup = (Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60);
        if (hoursSinceBackup > 24) {
          warnings.push(`Last backup was ${hoursSinceBackup.toFixed(1)} hours ago`);
        }
      } else {
        warnings.push('No backups found');
      }

      if (warnings.length > 0) {
        status = warnings.length > 2 ? 'critical' : 'warning';
      }

      return {
        status,
        timestamp: new Date().toISOString(),
        file: {
          path: dbConfig.dbPath,
          sizeMB: fileSize,
          rowCount
        },
        thresholds: {
          maxRows: MAX_ROWS,
          warningRows: WARNING_ROWS,
          maxFileSizeMB: MAX_SIZE_MB,
          warningFileSizeMB: WARNING_SIZE_MB
        },
        backup: {
          lastBackup,
          backupCount: backups.length,
          totalBackupSizeMB: parseFloat(
            backups.reduce((sum, b) => sum + parseFloat(b.sizeMB), 0).toFixed(2)
          )
        },
        warnings
      };
    } catch (error) {
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error.message,
        warnings: ['Failed to perform health check']
      };
    }
  }

  /**
   * Archive old records (older than specified months)
   *
   * @param {number} monthsOld - Archive records older than this many months
   * @returns {Promise<Object>} Archive results
   */
  async archiveOldRecords(monthsOld = 6) {
    // Determine cutoff date
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsOld);
    const cutoffDateStr = cutoffDate.toISOString();

    try {
      // Create backup before archiving
      await backupService.createBackup();

      // Count eligible records
      const countRow = await dbService.get(
        `SELECT COUNT(*) as count FROM submissions WHERE submissionDate < ?`,
        [cutoffDateStr]
      );
      const count = countRow ? countRow.count : 0;

      if (count === 0) {
        return {
          success: true,
          message: 'No records to archive',
          archivedCount: 0
        };
      }

      // We should first export these to an archive file (Excel) before deleting
      // This effectively moves them to an archive file

      // 1. Get filtered submissions
      const submissions = await dbService.all(
        `SELECT * FROM submissions WHERE submissionDate < ?`,
        [cutoffDateStr]
      );

      // 2. Export them using dbService export logic or custom logic
      // We can reuse ExcelJS here locally to save archive
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Archived Submissions');

      // Define columns
      worksheet.columns = [
        { header: 'ID', key: 'id', width: 25 },
        { header: 'Submission Date', key: 'submissionDate', width: 20 },
        { header: 'Booking Date', key: 'bookingDate', width: 20 },
        { header: 'Name', key: 'name', width: 30 },
        { header: 'UPI Number', key: 'upiNumber', width: 15 },
        { header: 'WhatsApp Number', key: 'whatsappNumber', width: 15 },
        { header: 'Ayambil Shala Name', key: 'ayambilShalaName', width: 40 },
        { header: 'City', key: 'city', width: 20 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'IP Address', key: 'ipAddress', width: 20 }
      ];

      worksheet.getRow(1).font = { bold: true };

      submissions.forEach(s => {
        worksheet.addRow({
          ...s,
          submissionDate: new Date(s.submissionDate),
          bookingDate: new Date(s.bookingDate)
        });
      });

      // 3. Save archive file
      const timestamp = new Date().toISOString().split('T')[0];
      const archivePath = require('path').join(
        excelConfig.archiveDir,
        `archive_${timestamp}_${count}records.xlsx`
      );

      // Ensure dir exists (reuse logic or add check)
      await fs.mkdir(excelConfig.archiveDir, { recursive: true });

      await workbook.xlsx.writeFile(archivePath);

      // 4. Delete from DB
      await dbService.run(
        `DELETE FROM submissions WHERE submissionDate < ?`,
        [cutoffDateStr]
      );

      return {
        success: true,
        message: `Successfully archived ${count} records`,
        archivedCount: count,
        archivePath,
        cutoffDate
      };

    } catch (error) {
      console.error('Archive failed:', error.message);
      throw error;
    }
  }
}

module.exports = new MonitorService();
