const { body, validationResult } = require('express-validator');
const { isValidMobile, isValidEmail } = require('../utils/helpers');

/**
 * Validation rules for form submission
 */
const submissionValidationRules = [
  body('bookingDate')
    .notEmpty()
    .withMessage('બુકિંગ તારીખ જરૂરી છે (Booking date is required)')
    .isISO8601()
    .withMessage('માન્ય તારીખ દાખલ કરો (Enter valid date)'),

  body('name')
    .trim()
    .notEmpty()
    .withMessage('નામ જરૂરી છે (Name is required)')
    .isLength({ min: 2, max: 100 })
    .withMessage('નામ 2 થી 100 અક્ષરો વચ્ચે હોવું જોઈએ (Name must be between 2 and 100 characters)'),

  body('upiNumber')
    .trim()
    .notEmpty()
    .withMessage('UPI નંબર જરૂરી છે (UPI number is required)')
    .custom((value) => {
      if (!isValidMobile(value)) {
        throw new Error('માન્ય 10 અંકનો UPI નંબર દાખલ કરો (Enter valid 10 digit UPI number)');
      }
      return true;
    }),

  body('whatsappNumber')
    .trim()
    .notEmpty()
    .withMessage('WhatsApp નંબર જરૂરી છે (WhatsApp number is required)')
    .custom((value) => {
      if (!isValidMobile(value)) {
        throw new Error('માન્ય 10 અંકનો WhatsApp નંબર દાખલ કરો (Enter valid 10 digit WhatsApp number)');
      }
      return true;
    }),

  body('ayambilShalaName')
    .trim()
    .notEmpty()
    .withMessage('આયંબિલ શાળા નામ જરૂરી છે (Ayambil Shala name is required)')
    .isLength({ min: 2, max: 200 })
    .withMessage('શાળા નામ 2 થી 200 અક્ષરો વચ્ચે હોવું જોઈએ (Shala name must be between 2 and 200 characters)'),

  body('city')
    .trim()
    .notEmpty()
    .withMessage('શહેર જરૂરી છે (City is required)')
    .isLength({ min: 2, max: 100 })
    .withMessage('શહેર 2 થી 100 અક્ષરો વચ્ચે હોવું જોઈએ (City must be between 2 and 100 characters)')
];

/**
 * Validation rules for updating submission
 */
const updateSubmissionValidationRules = [
  body('status')
    .optional()
    .isIn(['pending', 'reviewed', 'archived', 'confirmed', 'rejected'])
    .withMessage('Status must be one of: pending, reviewed, archived, confirmed, rejected'),

  body('bookingDate')
    .optional()
    .isISO8601()
    .withMessage('માન્ય તારીખ દાખલ કરો (Enter valid date)'),

  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('નામ 2 થી 100 અક્ષરો વચ્ચે હોવું જોઈએ (Name must be between 2 and 100 characters)'),

  body('upiNumber')
    .optional()
    .trim()
    .custom((value) => {
      if (value && !isValidMobile(value)) {
        throw new Error('માન્ય 10 અંકનો UPI નંબર દાખલ કરો (Enter valid 10 digit UPI number)');
      }
      return true;
    }),

  body('whatsappNumber')
    .optional()
    .trim()
    .custom((value) => {
      if (value && !isValidMobile(value)) {
        throw new Error('માન્ય 10 અંકનો WhatsApp નંબર દાખલ કરો (Enter valid 10 digit WhatsApp number)');
      }
      return true;
    }),

  body('ayambilShalaName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('શાળા નામ 2 થી 200 અક્ષરો વચ્ચે હોવું જોઈએ (Shala name must be between 2 and 200 characters)'),

  body('city')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('શહેર 2 થી 100 અક્ષરો વચ્ચે હોવું જોઈએ (City must be between 2 and 100 characters)')
];

/**
 * Middleware to handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }

  next();
};

/**
 * Sanitize submission data
 */
const sanitizeSubmissionData = (req, res, next) => {
  const { sanitizeInput } = require('../utils/helpers');

  if (req.body.name) req.body.name = sanitizeInput(req.body.name);
  if (req.body.upiNumber) req.body.upiNumber = sanitizeInput(req.body.upiNumber);
  if (req.body.whatsappNumber) req.body.whatsappNumber = sanitizeInput(req.body.whatsappNumber);
  if (req.body.ayambilShalaName) req.body.ayambilShalaName = sanitizeInput(req.body.ayambilShalaName);
  if (req.body.city) req.body.city = sanitizeInput(req.body.city);

  next();
};

module.exports = {
  submissionValidationRules,
  updateSubmissionValidationRules,
  handleValidationErrors,
  sanitizeSubmissionData
};
