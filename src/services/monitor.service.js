const fs = require('fs').promises;
const ExcelJS = require('exceljs');
const excelConfig = require('../config/excel.config');
const backupService = require('./backup.service');

class MonitorService {
  /**
   * Check Excel file size
   *
   * @returns {Promise<number>} File size in MB
   */
  async checkFileSize() {
    try {
      const stats = await fs.stat(excelConfig.excelFilePath);
      const sizeInMB = stats.size / (1024 * 1024);

      if (sizeInMB > excelConfig.warningFileSizeMB) {
        console.warn(`⚠️  Excel file is ${sizeInMB.toFixed(2)}MB (Warning threshold: ${excelConfig.warningFileSizeMB}MB)`);
      }

      if (sizeInMB > excelConfig.maxFileSizeMB) {
        console.error(`❌ Excel file exceeds maximum size: ${sizeInMB.toFixed(2)}MB > ${excelConfig.maxFileSizeMB}MB`);
        console.error('   Consider archiving old records immediately!');
      }

      return sizeInMB;
    } catch (error) {
      console.error('Error checking file size:', error.message);
      return 0;
    }
  }

  /**
   * Get row count in Excel file
   *
   * @returns {Promise<number>} Number of rows (excluding header)
   */
  async getRowCount() {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(excelConfig.excelFilePath);
      const worksheet = workbook.getWorksheet('Submissions');

      const rowCount = worksheet.rowCount - 1; // Minus header

      if (rowCount > excelConfig.warningRows) {
        console.warn(`⚠️  Excel file has ${rowCount} rows (Warning threshold: ${excelConfig.warningRows})`);
        console.warn('   Consider archiving old records soon');
      }

      if (rowCount > excelConfig.maxRows) {
        console.error(`❌ Excel file exceeds maximum rows: ${rowCount} > ${excelConfig.maxRows}`);
        console.error('   Archive old records or migrate to database!');
      }

      return rowCount;
    } catch (error) {
      console.error('Error getting row count:', error.message);
      return 0;
    }
  }

  /**
   * Get comprehensive health check
   *
   * @returns {Promise<Object>} Health check results
   */
  async getHealthCheck() {
    try {
      const [fileSize, rowCount, lastBackup, backups] = await Promise.all([
        this.checkFileSize(),
        this.getRowCount(),
        backupService.getLastBackupTime(),
        backupService.listBackups()
      ]);

      const stats = await fs.stat(excelConfig.excelFilePath);

      // Calculate health status
      let status = 'healthy';
      const warnings = [];

      if (fileSize > excelConfig.warningFileSizeMB) {
        warnings.push(`File size is ${fileSize.toFixed(2)}MB (threshold: ${excelConfig.warningFileSizeMB}MB)`);
      }

      if (rowCount > excelConfig.warningRows) {
        warnings.push(`Row count is ${rowCount} (threshold: ${excelConfig.warningRows})`);
      }

      if (lastBackup) {
        const hoursSinceBackup = (Date.now() - lastBackup.getTime()) / (1000 * 60 * 60);
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
          path: excelConfig.excelFilePath,
          sizeMB: parseFloat(fileSize.toFixed(2)),
          sizeBytes: stats.size,
          lastModified: stats.mtime,
          rowCount
        },
        thresholds: {
          maxRows: excelConfig.maxRows,
          warningRows: excelConfig.warningRows,
          maxFileSizeMB: excelConfig.maxFileSizeMB,
          warningFileSizeMB: excelConfig.warningFileSizeMB
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
    try {
      const ExcelJS = require('exceljs');
      const path = require('path');

      // Create backup before archiving
      await backupService.createBackup();

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(excelConfig.excelFilePath);
      const worksheet = workbook.getWorksheet('Submissions');

      // Calculate cutoff date
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - monthsOld);

      // Create archive workbook
      const archiveWorkbook = new ExcelJS.Workbook();
      const archiveSheet = archiveWorkbook.addWorksheet('Archived Submissions');
      archiveSheet.columns = excelConfig.columns;

      // Style header
      archiveSheet.getRow(1).font = { bold: true };
      archiveSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      const rowsToArchive = [];

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          const date = new Date(row.getCell(2).value);
          if (date < cutoffDate) {
            // Copy row to archive
            const rowData = {};
            excelConfig.columns.forEach((col, index) => {
              rowData[col.key] = row.getCell(index + 1).value;
            });
            archiveSheet.addRow(rowData);
            rowsToArchive.push(rowNumber);
          }
        }
      });

      if (rowsToArchive.length === 0) {
        return {
          success: true,
          message: 'No records to archive',
          archivedCount: 0
        };
      }

      // Save archive
      const timestamp = new Date().toISOString().split('T')[0];
      const archivePath = path.join(
        excelConfig.archiveDir,
        `archive_${timestamp}_${rowsToArchive.length}records.xlsx`
      );

      await archiveWorkbook.xlsx.writeFile(archivePath);

      // Remove archived rows from main file (in reverse to maintain indices)
      for (let i = rowsToArchive.length - 1; i >= 0; i--) {
        worksheet.spliceRows(rowsToArchive[i], 1);
      }

      await workbook.xlsx.writeFile(excelConfig.excelFilePath);

      console.log(`✓ Archived ${rowsToArchive.length} records to ${archivePath}`);

      return {
        success: true,
        message: `Successfully archived ${rowsToArchive.length} records`,
        archivedCount: rowsToArchive.length,
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
