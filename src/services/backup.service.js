const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');
const excelConfig = require('../config/excel.config');

class BackupService {
  constructor() {
    this.backupDir = excelConfig.backupDir;
    this.maxBackups = excelConfig.maxBackups;
    this.filePath = excelConfig.excelFilePath;
  }

  /**
   * Create backup of Excel file
   *
   * @returns {Promise<string>} Path to backup file
   */
  async createBackup() {
    try {
      // Ensure backup directory exists
      await fs.mkdir(this.backupDir, { recursive: true });

      // Check if source file exists
      try {
        await fs.access(this.filePath);
      } catch {
        console.log('⚠️  Source Excel file does not exist yet. Skipping backup.');
        return null;
      }

      // Generate backup filename with timestamp
      const timestamp = new Date()
        .toISOString()
        .replace(/T/, '_')
        .replace(/\..+/, '')
        .replace(/:/g, '-');

      const backupFileName = `submissions_backup_${timestamp}.xlsx`;
      const backupPath = path.join(this.backupDir, backupFileName);

      // Copy file
      await fs.copyFile(this.filePath, backupPath);

      console.log(`✓ Backup created: ${backupFileName}`);

      // Clean old backups
      await this.cleanOldBackups();

      return backupPath;
    } catch (error) {
      console.error('❌ Backup failed:', error.message);
      throw error;
    }
  }

  /**
   * Clean old backups (keep only last N backups)
   */
  async cleanOldBackups() {
    try {
      const files = await fs.readdir(this.backupDir);

      const backupFiles = files
        .filter(f => f.startsWith('submissions_backup_') && f.endsWith('.xlsx'))
        .map(f => ({
          name: f,
          path: path.join(this.backupDir, f)
        }));

      if (backupFiles.length <= this.maxBackups) {
        return;
      }

      // Get file stats for sorting
      const filesWithStats = await Promise.all(
        backupFiles.map(async file => {
          const stats = await fs.stat(file.path);
          return {
            ...file,
            mtime: stats.mtime
          };
        })
      );

      // Sort by modification time (oldest first)
      filesWithStats.sort((a, b) => a.mtime - b.mtime);

      // Delete oldest files
      const filesToDelete = filesWithStats.slice(0, filesWithStats.length - this.maxBackups);

      for (const file of filesToDelete) {
        await fs.unlink(file.path);
        console.log(`🗑️  Deleted old backup: ${file.name}`);
      }

      if (filesToDelete.length > 0) {
        console.log(`✓ Cleaned ${filesToDelete.length} old backup(s)`);
      }
    } catch (error) {
      console.error('Error cleaning old backups:', error.message);
    }
  }

  /**
   * Get list of all backups
   *
   * @returns {Promise<Array>} List of backup files with metadata
   */
  async listBackups() {
    try {
      const files = await fs.readdir(this.backupDir);

      const backupFiles = files
        .filter(f => f.startsWith('submissions_backup_') && f.endsWith('.xlsx'))
        .map(f => ({
          name: f,
          path: path.join(this.backupDir, f)
        }));

      const backupsWithStats = await Promise.all(
        backupFiles.map(async file => {
          const stats = await fs.stat(file.path);
          return {
            name: file.name,
            path: file.path,
            size: stats.size,
            sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
            created: stats.mtime
          };
        })
      );

      // Sort by date (newest first)
      backupsWithStats.sort((a, b) => b.created - a.created);

      return backupsWithStats;
    } catch (error) {
      console.error('Error listing backups:', error.message);
      return [];
    }
  }

  /**
   * Restore from backup file
   *
   * @param {string} backupFileName - Name of backup file to restore
   * @returns {Promise<Object>} Restore result
   */
  async restoreFromBackup(backupFileName) {
    try {
      const backupPath = path.join(this.backupDir, backupFileName);

      // Check if backup exists
      await fs.access(backupPath);

      // Create backup of current file before restoring
      const corruptedFileName = `corrupted_${Date.now()}.xlsx`;
      const corruptedPath = path.join(this.backupDir, corruptedFileName);

      try {
        await fs.copyFile(this.filePath, corruptedPath);
        console.log(`✓ Current file backed up as: ${corruptedFileName}`);
      } catch {
        console.log('⚠️  No current file to backup');
      }

      // Restore from backup
      await fs.copyFile(backupPath, this.filePath);

      console.log(`✓ Restored from backup: ${backupFileName}`);

      return {
        success: true,
        message: `Successfully restored from ${backupFileName}`,
        backupFile: backupFileName
      };
    } catch (error) {
      console.error('❌ Restore failed:', error.message);
      throw new Error(`Failed to restore from backup: ${error.message}`);
    }
  }

  /**
   * Get last backup time
   *
   * @returns {Promise<Date|null>} Date of last backup
   */
  async getLastBackupTime() {
    try {
      const backups = await this.listBackups();
      return backups.length > 0 ? backups[0].created : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Schedule automatic backups
   */
  scheduleAutoBackup() {
    if (!excelConfig.autoBackupEnabled) {
      console.log('⚠️  Auto-backup is disabled');
      return;
    }

    const interval = excelConfig.backupInterval;

    let cronExpression;
    let description;

    switch (interval) {
      case 'hourly':
        cronExpression = '0 * * * *'; // Every hour at minute 0
        description = 'hourly';
        break;
      case 'daily':
        cronExpression = '0 2 * * *'; // Every day at 2:00 AM
        description = 'daily at 2:00 AM';
        break;
      case 'weekly':
        cronExpression = '0 2 * * 0'; // Every Sunday at 2:00 AM
        description = 'weekly on Sunday at 2:00 AM';
        break;
      default:
        // Custom cron expression
        cronExpression = interval;
        description = `custom (${interval})`;
    }

    cron.schedule(cronExpression, async () => {
      console.log(`⏰ Running scheduled backup (${description})...`);
      try {
        await this.createBackup();
      } catch (error) {
        console.error('Scheduled backup failed:', error.message);
      }
    });

    console.log(`✓ Auto-backup scheduled: ${description}`);
  }
}

module.exports = new BackupService();
