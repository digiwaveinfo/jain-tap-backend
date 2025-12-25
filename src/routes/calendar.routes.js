const express = require('express');
const router = express.Router();
const calendarController = require('../controllers/calendar.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

// Public: Get availability configuration
router.get('/', calendarController.getCalendarSettings);

// Admin: Set date status
router.post('/status', authenticateToken, calendarController.setDateStatus);

// Admin: Bulk update
router.post('/bulk', authenticateToken, calendarController.bulkUpdateDates);

module.exports = router;
