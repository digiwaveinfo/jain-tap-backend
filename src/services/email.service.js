const nodemailer = require('nodemailer');
const emailConfig = require('../config/email.config');

class EmailService {
  constructor() {
    this.transporter = null;
    this.enabled = emailConfig.enabled;

    if (this.enabled) {
      this.initializeTransporter();
    }
  }

  /**
   * Initialize email transporter
   */
  initializeTransporter() {
    try {
      this.transporter = nodemailer.createTransporter(emailConfig.smtp);
      console.log('✓ Email service initialized');
    } catch (error) {
      console.error('❌ Email service initialization failed:', error.message);
      this.enabled = false;
    }
  }

  /**
   * Send submission confirmation email
   *
   * @param {Object} data - Submission data
   * @returns {Promise<Object>} Send result
   */
  async sendSubmissionConfirmation(data) {
    if (!this.enabled || !data.email) {
      return {
        success: false,
        message: 'Email service is disabled or no email provided'
      };
    }

    try {
      const mailOptions = {
        from: emailConfig.from,
        to: data.email,
        subject: emailConfig.templates.submission.gujaratiSubject,
        html: this.generateSubmissionEmailHTML(data)
      };

      const info = await this.transporter.sendMail(mailOptions);

      console.log('✓ Email sent:', info.messageId);

      return {
        success: true,
        messageId: info.messageId,
        message: 'Email sent successfully'
      };
    } catch (error) {
      console.error('❌ Email send failed:', error.message);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Generate HTML for submission confirmation email
   *
   * @param {Object} data - Submission data
   * @returns {string} HTML content
   */
  generateSubmissionEmailHTML(data) {
    return `
<!DOCTYPE html>
<html lang="gu">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: 'Noto Sans Gujarati', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
      border-radius: 10px 10px 0 0;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
    }
    .content {
      background: #f9f9f9;
      padding: 30px;
      border-radius: 0 0 10px 10px;
    }
    .success-icon {
      text-align: center;
      font-size: 48px;
      margin: 20px 0;
    }
    .details {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .detail-row {
      margin: 10px 0;
      padding: 8px 0;
      border-bottom: 1px solid #eee;
    }
    .detail-label {
      font-weight: bold;
      color: #667eea;
    }
    .submission-id {
      background: #667eea;
      color: white;
      padding: 10px 20px;
      border-radius: 5px;
      text-align: center;
      font-weight: bold;
      margin: 20px 0;
    }
    .footer {
      text-align: center;
      padding: 20px;
      color: #666;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🙏 વિહાર રક્ષા તપ</h1>
    <p>Form Submission Confirmation</p>
  </div>

  <div class="content">
    <div class="success-icon">✅</div>

    <h2 style="text-align: center; color: #667eea;">તમારો ફોર્મ સફળતાપૂર્વક સબમિટ થયો છે!</h2>
    <p style="text-align: center;">Your form has been submitted successfully!</p>

    <div class="submission-id">
      Submission ID: ${data.id}
    </div>

    <div class="details">
      <h3>તમારી વિગતો / Your Details:</h3>

      <div class="detail-row">
        <span class="detail-label">નામ / Name:</span> ${data.name}
      </div>

      <div class="detail-row">
        <span class="detail-label">મોબાઇલ / Mobile:</span> ${data.mobile}
      </div>

      ${data.email ? `
      <div class="detail-row">
        <span class="detail-label">ઈમેલ / Email:</span> ${data.email}
      </div>
      ` : ''}

      ${data.city ? `
      <div class="detail-row">
        <span class="detail-label">શહેર / City:</span> ${data.city}
      </div>
      ` : ''}

      <div class="detail-row">
        <span class="detail-label">સબમિશન તારીખ / Submission Date:</span> ${new Date(data.date).toLocaleString('en-IN')}
      </div>
    </div>

    <p style="background: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; border-radius: 4px;">
      <strong>નોંધ / Note:</strong> કૃપા કરીને આ Submission ID ભવિષ્યના સંદર્ભ માટે સાચવી રાખો.<br>
      Please save this Submission ID for future reference.
    </p>
  </div>

  <div class="footer">
    <p>જય જિનેન્દ્ર! 🙏</p>
    <p style="color: #999; font-size: 12px;">
      This is an automated message. Please do not reply to this email.
    </p>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Send admin notification email
   *
   * @param {Object} data - Notification data
   * @returns {Promise<Object>} Send result
   */
  async sendAdminNotification(data) {
    if (!this.enabled) {
      return { success: false, message: 'Email service is disabled' };
    }

    try {
      const mailOptions = {
        from: emailConfig.from,
        to: process.env.ADMIN_EMAIL || emailConfig.from,
        subject: `New Form Submission - ${data.name}`,
        html: `
          <h2>New Form Submission Received</h2>
          <p><strong>Name:</strong> ${data.name}</p>
          <p><strong>Mobile:</strong> ${data.mobile}</p>
          <p><strong>Email:</strong> ${data.email || 'N/A'}</p>
          <p><strong>City:</strong> ${data.city || 'N/A'}</p>
          <p><strong>Submission ID:</strong> ${data.id}</p>
          <p><strong>Time:</strong> ${new Date(data.date).toLocaleString()}</p>
        `
      };

      const info = await this.transporter.sendMail(mailOptions);

      return {
        success: true,
        messageId: info.messageId
      };
    } catch (error) {
      console.error('Admin notification failed:', error.message);
      return {
        success: false,
        message: error.message
      };
    }
  }
}

module.exports = new EmailService();
