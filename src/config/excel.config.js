const path = require('path');

module.exports = {
  // File paths
  excelFilePath: path.join(__dirname, '../../data/submissions.xlsx'),
  backupDir: path.join(__dirname, '../../data/backups'),
  exportDir: path.join(__dirname, '../../data/exports'),
  archiveDir: path.join(__dirname, '../../data/archives'),

  // File locking configuration
  lockOptions: {
    retries: {
      retries: 15,
      minTimeout: 100,
      maxTimeout: 2000,
      factor: 2
    },
    stale: 10000 // Consider lock stale after 10 seconds
  },

  // Performance thresholds
  maxRows: parseInt(process.env.EXCEL_MAX_ROWS) || 50000,
  warningRows: 10000,
  maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB) || 10,
  warningFileSizeMB: 5,

  // Backup settings
  maxBackups: 30,
  autoBackupEnabled: process.env.AUTO_BACKUP_ENABLED === 'true',
  backupInterval: process.env.BACKUP_INTERVAL || 'daily',

  // Booking settings
  maxBookingsPerDay: 3,

  // Column configuration (Gujarati headers)
  columns: [
    { header: 'ID', key: 'id', width: 25 },
    { header: 'સબમિશન તારીખ (Submission Date)', key: 'submissionDate', width: 20 },
    { header: 'બુકિંગ તારીખ (Booking Date)', key: 'bookingDate', width: 20 },
    { header: 'નામ (Name)', key: 'name', width: 30 },
    { header: 'UPI નંબર (UPI Number)', key: 'upiNumber', width: 15 },
    { header: 'WhatsApp નંબર (WhatsApp Number)', key: 'whatsappNumber', width: 15 },
    { header: 'આયંબિલ શાળા નામ (Ayambil Shala Name)', key: 'ayambilShalaName', width: 40 },
    { header: 'શહેર (City)', key: 'city', width: 20 },
    { header: 'સ્થિતિ (Status)', key: 'status', width: 15 },
    { header: 'IP Address', key: 'ipAddress', width: 20 }
  ]
};
