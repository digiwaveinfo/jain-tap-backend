const path = require('path');

module.exports = {
    dbPath: path.join(__dirname, '../../data/database.sqlite'),
    // Booking settings
    maxBookingsPerDay: 3,
};
