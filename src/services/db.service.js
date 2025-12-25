const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const dbConfig = require('../config/db.config');
const excelConfig = require('../config/excel.config'); // For export dir path
const { generateSubmissionId } = require('../utils/helpers');
const ExcelJS = require('exceljs');

class DbService {
    constructor() {
        this.dbPath = dbConfig.dbPath;
        this.db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
            } else {
                console.log('✓ Connected to SQLite database.');
                this.initializeDatabase();
            }
        });
    }

    // Helper to wrap db.run in Promise
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function (err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    }

    // Helper to wrap db.get in Promise
    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    // Helper to wrap db.all in Promise
    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    /**
     * Initialize Database Tables
     */
    async initializeDatabase() {
        try {
            // Create submissions table
            await this.run(`
        CREATE TABLE IF NOT EXISTS submissions (
          id TEXT PRIMARY KEY,
          submissionDate TEXT NOT NULL,
          bookingDate TEXT NOT NULL,
          name TEXT NOT NULL,
          upiNumber TEXT NOT NULL,
          whatsappNumber TEXT NOT NULL,
          ayambilShalaName TEXT NOT NULL,
          city TEXT NOT NULL,
          email TEXT,
          status TEXT DEFAULT 'pending',
          ipAddress TEXT
        )
      `);

            // Create settings table
            await this.run(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);

            // Seed default settings if not exist
            await this.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('max_bookings_per_day', '3')`);
            await this.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('max_bookings_per_month', '1000')`); // Default high limit

            // Create anumodana images table
            await this.run(`
        CREATE TABLE IF NOT EXISTS anumodana_images (
          id TEXT PRIMARY KEY,
          url TEXT NOT NULL,
          date TEXT NOT NULL,
          description TEXT,
          createdAt TEXT NOT NULL
        )
      `);

            // Create calendar availability table (whitelist of open dates)
            await this.run(`
        CREATE TABLE IF NOT EXISTS calendar_availability (
          date TEXT PRIMARY KEY, -- YYYY-MM-DD
          status TEXT DEFAULT 'open' -- open, closed (explicitly closed)
        )
      `);

            // Index for faster queries
            await this.run(`CREATE INDEX IF NOT EXISTS idx_booking_date ON submissions(bookingDate)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_status ON submissions(status)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_anumodana_date ON anumodana_images(date)`);

            console.log('✓ Database tables initialized');
        } catch (error) {
            console.error('Error initializing database tables:', error);
        }
    }

    /**
     * Get a setting value
     */
    async getSetting(key, defaultValue = null) {
        try {
            const row = await this.get('SELECT value FROM settings WHERE key = ?', [key]);
            return row ? row.value : defaultValue;
        } catch (error) {
            console.error(`Error getting setting ${key}:`, error);
            return defaultValue;
        }
    }

    /**
     * Set a setting value
     */
    async setSetting(key, value) {
        await this.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, String(value)]);
        return value;
    }

    /**
     * Add new submission with concurrency check
     */
    async addSubmission(data) {
        return new Promise((resolve, reject) => {
            // Serialize to ensure sequential execution within this block
            this.db.serialize(() => {
                this.db.run('BEGIN EXCLUSIVE TRANSACTION');

                const bookingDateStr = data.bookingDate ? new Date(data.bookingDate).toISOString().split('T')[0] : null;

                // Get dynamic limits
                this.db.all('SELECT key, value FROM settings WHERE key IN (?, ?)', ['max_bookings_per_day', 'max_bookings_per_month'], (err, settingsRows) => {
                    if (err) {
                        this.db.run('ROLLBACK');
                        return reject(err);
                    }

                    const settings = {};
                    settingsRows.forEach(row => settings[row.key] = row.value);

                    const maxBookingsPerDay = parseInt(settings['max_bookings_per_day'] || '3', 10);
                    const maxBookingsPerMonth = parseInt(settings['max_bookings_per_month'] || '1000', 10);

                    // Check if date is "open" in calendar_availability
                    this.db.get('SELECT status FROM calendar_availability WHERE date = ?', [bookingDateStr], (err, availRow) => {
                        if (err) {
                            this.db.run('ROLLBACK');
                            return reject(err);
                        }

                        // If no row found, it's NOT open (by default not available)
                        if (!availRow || availRow.status !== 'open') {
                            this.db.run('ROLLBACK');
                            return reject(new Error('This date is not available for booking yet'));
                        }

                        // Check monthly limit for user (Mobile number based)
                        const bookingMonthStr = bookingDateStr.substring(0, 7); // YYYY-MM

                        this.db.get(
                            `SELECT COUNT(*) as count FROM submissions 
                     WHERE strftime('%Y-%m', bookingDate) = ? 
                     AND (upiNumber = ? OR whatsappNumber = ?)
                     AND status != 'archived' AND status != 'rejected'`,
                            [bookingMonthStr, data.upiNumber, data.whatsappNumber],
                            (err, userCountRow) => {
                                if (err) {
                                    this.db.run('ROLLBACK');
                                    return reject(err);
                                }

                                if (userCountRow.count >= maxBookingsPerMonth) {
                                    this.db.run('ROLLBACK');
                                    return reject(new Error(`Monthly booking limit reached (${maxBookingsPerMonth} bookings per month)`));
                                }

                                // Check current count for the date
                                this.db.get(
                                    `SELECT COUNT(*) as count FROM submissions WHERE date(bookingDate) = date(?) AND status != 'archived'`,
                                    [bookingDateStr],
                                    (err, row) => {
                                        if (err) {
                                            this.db.run('ROLLBACK');
                                            return reject(err);
                                        }

                                        if (row.count >= maxBookingsPerDay) {
                                            this.db.run('ROLLBACK');
                                            return reject(new Error('Date is fully booked'));
                                        }

                                        // Insert new record
                                        const id = generateSubmissionId();
                                        const submissionDate = new Date().toISOString();

                                        const insertSql = `
                              INSERT INTO submissions (
                                id, submissionDate, bookingDate, name, upiNumber, 
                                whatsappNumber, ayambilShalaName, city, email, status, ipAddress
                              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            `;

                                        this.db.run(
                                            insertSql,
                                            [
                                                id, submissionDate, bookingDateStr, data.name, data.upiNumber,
                                                data.whatsappNumber, data.ayambilShalaName, data.city,
                                                data.email || null, 'pending', data.ipAddress || ''
                                            ],
                                            (insertErr) => {
                                                if (insertErr) {
                                                    this.db.run('ROLLBACK');
                                                    return reject(insertErr);
                                                }

                                                this.db.run('COMMIT', (commitErr) => {
                                                    if (commitErr) return reject(commitErr);
                                                    resolve({
                                                        success: true,
                                                        id,
                                                        message: 'તમારો ફોર્મ સફળતાપૂર્વક સબમિટ થયો છે',
                                                        data: { ...data, id, submissionDate, status: 'pending' }
                                                    });
                                                });
                                            }
                                        );
                                    }
                                );
                            }
                        );
                    });
                });
            });
        });
    }

    /**
     * Get all submissions with optional filters
     */
    async getAllSubmissions(filters = {}) {
        let sql = 'SELECT * FROM submissions WHERE 1=1';
        const params = [];

        if (filters.status) {
            sql += ' AND status = ?';
            params.push(filters.status);
        }
        if (filters.city) {
            sql += ' AND city = ?';
            params.push(filters.city);
        }

        // Sort by submissionDate descending
        sql += ' ORDER BY submissionDate DESC';

        return await this.all(sql, params);
    }

    /**
     * Get submission by ID
     */
    async getSubmissionById(id) {
        return await this.get('SELECT * FROM submissions WHERE id = ?', [id]);
    }

    /**
     * Update submission
     */
    async updateSubmission(id, updates) {
        // Dynamically build update query
        const fields = [];
        const params = [];

        // Map allowed fields
        const allowedFields = ['status', 'bookingDate', 'name', 'upiNumber', 'whatsappNumber', 'ayambilShalaName', 'city', 'email'];

        for (const key of Object.keys(updates)) {
            if (allowedFields.includes(key) && updates[key] !== undefined) {
                let value = updates[key];
                if (key === 'bookingDate') {
                    value = new Date(value).toISOString().split('T')[0];
                }
                fields.push(`${key} = ?`);
                params.push(value);
            }
        }

        if (fields.length === 0) return { success: true, message: 'No changes made' };

        const sql = `UPDATE submissions SET ${fields.join(', ')} WHERE id = ?`;
        params.push(id);

        const result = await this.run(sql, params);

        if (result.changes === 0) {
            throw new Error('Submission not found');
        }

        const updated = await this.getSubmissionById(id);
        return {
            success: true,
            message: 'Submission updated successfully',
            data: updated
        };
    }

    /**
     * Delete submission
     */
    async deleteSubmission(id) {
        const result = await this.run('DELETE FROM submissions WHERE id = ?', [id]);

        if (result.changes === 0) {
            throw new Error('Submission not found');
        }

        return {
            success: true,
            message: 'Submission deleted successfully'
        };
    }

    /**
     * Search submissions
     */
    async searchSubmissions(query) {
        const sql = `
      SELECT * FROM submissions 
      WHERE name LIKE ? 
      OR upiNumber LIKE ? 
      OR whatsappNumber LIKE ? 
      OR ayambilShalaName LIKE ? 
      OR city LIKE ? 
      OR id LIKE ?
      ORDER BY submissionDate DESC
    `;
        const term = `%${query}%`;
        return await this.all(sql, [term, term, term, term, term, term]);
    }

    /**
     * Get statistics
     */
    async getStatistics() {
        const total = await this.get('SELECT COUNT(*) as count FROM submissions');
        const today = await this.get("SELECT COUNT(*) as count FROM submissions WHERE date(submissionDate) = date('now')");
        const pending = await this.get("SELECT COUNT(*) as count FROM submissions WHERE status = 'pending'");
        const reviewed = await this.get("SELECT COUNT(*) as count FROM submissions WHERE status = 'reviewed'");
        const archived = await this.get("SELECT COUNT(*) as count FROM submissions WHERE status = 'archived'");

        let fileSizeMB = 0;
        try {
            const stats = await fs.stat(this.dbPath);
            fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        } catch (e) { /* ignore */ }

        return {
            total: total.count,
            today: today.count,
            pending: pending.count,
            reviewed: reviewed.count,
            archived: archived.count,
            fileSizeMB: parseFloat(fileSizeMB)
        };
    }

    /**
     * Export submissions to Excel
     */
    async exportSubmissions(filters = {}) {
        const submissions = await this.getAllSubmissions(filters);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Submissions Export');

        // Headers from excelConfig or definition
        worksheet.columns = [
            { header: 'ID', key: 'id', width: 25 },
            { header: ' Submission Date', key: 'submissionDate', width: 20 },
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

        // Ensure export directory exists
        try {
            await fs.access(excelConfig.exportDir);
        } catch {
            await fs.mkdir(excelConfig.exportDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const exportPath = path.join(excelConfig.exportDir, `export_${timestamp}_${Date.now()}.xlsx`);

        await workbook.xlsx.writeFile(exportPath);
        return exportPath;
    }

    /**
     * Get booking counts by date range
     */
    async getBookingCountsByDateRange(startDate, endDate) {
        const startStr = startDate.toISOString().split('T')[0];
        const endStr = endDate.toISOString().split('T')[0];

        const sql = `
      SELECT bookingDate, COUNT(*) as count 
      FROM submissions 
      WHERE date(bookingDate) >= date(?) 
      AND date(bookingDate) <= date(?) 
      AND status != 'archived'
      GROUP BY bookingDate
    `;

        const rows = await this.all(sql, [startStr, endStr]);

        const counts = {};
        rows.forEach(row => {
            const dateStr = row.bookingDate.split('T')[0];
            counts[dateStr] = row.count;
        });

        return counts;
    }

    /**
     * Get granular calendar status for range
     */
    async getCalendarStatuses(startDate, endDate) {
        const startStr = startDate.toISOString().split('T')[0];
        const endStr = endDate.toISOString().split('T')[0];

        const openRows = await this.all(
            `SELECT date FROM calendar_availability WHERE date >= ? AND date <= ? AND status = 'open'`,
            [startStr, endStr]
        );
        const openDates = openRows.map(r => r.date);
        return { openDates };
    }

    /**
     * Check date availability
     */
    async isDateAvailable(date) {
        const dateStr = new Date(date).toISOString().split('T')[0];

        // Check if open in allowed list
        const availRow = await this.get('SELECT status FROM calendar_availability WHERE date = ?', [dateStr]);
        if (!availRow || availRow.status !== 'open') {
            return {
                available: false,
                count: 0,
                maxBookings: 0,
                remaining: 0,
                status: 'closed' // or coming_soon
            };
        }

        const row = await this.get(
            `SELECT COUNT(*) as count FROM submissions WHERE date(bookingDate) = date(?) AND status != 'archived'`,
            [dateStr]
        );

        const count = row ? row.count : 0;
        const maxBookingsStr = await this.getSetting('max_bookings_per_day', '3');
        const maxBookings = parseInt(maxBookingsStr, 10);

        return {
            available: count < maxBookings,
            count,
            maxBookings,
            remaining: maxBookings - count,
            status: 'open'
        };
    }

    /**
     * Get next available date
     */
    async getNextAvailableDate(startDate, maxDaysToSearch = 90) {
        const start = new Date(startDate);
        const maxBookingsStr = await this.getSetting('max_bookings_per_day', '3');
        const maxBookings = parseInt(maxBookingsStr, 10);

        // Get all open dates in range upfront to avoid N queries
        const endSearchDate = new Date(start);
        endSearchDate.setDate(endSearchDate.getDate() + maxDaysToSearch);
        const openRows = await this.all(
            `SELECT date FROM calendar_availability WHERE date >= ? AND date <= ? AND status = 'open'`,
            [start.toISOString().split('T')[0], endSearchDate.toISOString().split('T')[0]]
        );
        const openDateSet = new Set(openRows.map(r => r.date));

        for (let i = 0; i < maxDaysToSearch; i++) {
            const checkDate = new Date(start);
            checkDate.setDate(start.getDate() + i);
            const checkDateStr = checkDate.toISOString().split('T')[0];

            // Must be in open dates
            if (!openDateSet.has(checkDateStr)) continue;

            const row = await this.get(
                `SELECT COUNT(*) as count FROM submissions WHERE date(bookingDate) = date(?) AND status != 'archived'`,
                [checkDateStr]
            );

            const count = row ? row.count : 0;

            if (count < maxBookings) {
                return {
                    date: checkDateStr,
                    count: count,
                    remaining: maxBookings - count
                };
            }
        }
        return null;
    }

    /**
     * Validate booking date
     */
    async validateBookingDate(bookingDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const targetDate = new Date(bookingDate);
        targetDate.setHours(0, 0, 0, 0);

        if (targetDate < today) {
            return {
                valid: false,
                error: 'Past dates cannot be booked',
                errorGu: 'પાછલી તારીખો બુક કરી શકાતી નથી'
            };
        }

        const availability = await this.isDateAvailable(bookingDate);

        if (!availability.available) {
            // If closed, custom message
            if (availability.status === 'closed') {
                return {
                    valid: false,
                    error: 'Booking is not yet open for this date',
                    errorGu: 'આ તારીખ માટે બુકિંગ હજી શરૂ નથી થયું'
                };
            }

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

    // ===== Anumodana Images Methods =====

    async addAnumodanaImage(data) {
        const id = require('crypto').randomUUID();
        const createdAt = new Date().toISOString();

        await this.run(
            `INSERT INTO anumodana_images (id, url, date, description, createdAt) VALUES (?, ?, ?, ?, ?)`,
            [id, data.url, data.date, data.description, createdAt]
        );

        return { id, ...data, createdAt };
    }

    async getAnumodanaImages(limit = 50) {
        return await this.all(`SELECT * FROM anumodana_images ORDER BY date DESC, createdAt DESC LIMIT ?`, [limit]);
    }

    async deleteAnumodanaImage(id) {
        await this.run(`DELETE FROM anumodana_images WHERE id = ?`, [id]);
        return { success: true };
    }

    // ===== Calendar Management Methods =====

    async setCalendarDateStatus(date, status) {
        if (status === 'open') {
            await this.run(`INSERT OR REPLACE INTO calendar_availability (date, status) VALUES (?, ?)`, [date, 'open']);
        } else {
            await this.run(`DELETE FROM calendar_availability WHERE date = ?`, [date]);
        }
        return { date, status };
    }

    async getCalendarSettings(startDate, endDate) {
        const rows = await this.all(
            `SELECT date, status FROM calendar_availability WHERE date >= ? AND date <= ?`,
            [startDate, endDate]
        );
        return rows;
    }
}

module.exports = new DbService();
