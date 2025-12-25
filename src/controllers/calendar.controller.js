const dbService = require('../services/db.service');

/**
 * Get calendar settings / availability (Admin + Public)
 */
const getCalendarSettings = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'startDate and endDate are required'
            });
        }

        const settings = await dbService.getCalendarSettings(startDate, endDate);

        // Also get counts for these dates to show fullness?
        // Frontend likely calls getBookingCounts separately.

        res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        console.error('Get calendar settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch calendar settings'
        });
    }
};

/**
 * Set date status (Admin only)
 */
const setDateStatus = async (req, res) => {
    try {
        const { date, status } = req.body;

        if (!date || !status) {
            return res.status(400).json({
                success: false,
                message: 'Date and status are required'
            });
        }

        // status: 'open' or 'closed' (or any other status if we expand)
        // currently db service treats 'open' as available, anything else/missing as closed.

        const result = await dbService.setCalendarDateStatus(date, status);

        res.json({
            success: true,
            message: 'Date status updated',
            data: result
        });
    } catch (error) {
        console.error('Set date status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update date status'
        });
    }
};

/**
 * Bulk update dates (Admin only)
 */
const bulkUpdateDates = async (req, res) => {
    try {
        const { updates } = req.body; // Array of {date, status}

        if (!Array.isArray(updates)) {
            return res.status(400).json({ success: false, message: 'updates must be an array' });
        }

        const results = [];
        for (const update of updates) {
            if (update.date && update.status) {
                await dbService.setCalendarDateStatus(update.date, update.status);
                results.push(update);
            }
        }

        res.json({
            success: true,
            message: 'Dates updated successfully',
            count: results.length
        });
    } catch (error) {
        console.error('Bulk update error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update dates'
        });
    }
};

module.exports = {
    getCalendarSettings,
    setDateStatus,
    bulkUpdateDates
};
