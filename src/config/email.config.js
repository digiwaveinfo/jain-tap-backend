module.exports = {
  enabled: process.env.ENABLE_EMAIL === 'true',
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  },
  from: process.env.EMAIL_FROM || 'noreply@viharrakshatap.com',
  templates: {
    submission: {
      subject: 'વિહાર રક્ષા તપ - Form Submission Confirmation',
      gujaratiSubject: 'વિહાર રક્ષા તપ - ફોર્મ સબમિશન કન્ફર્મેશન'
    }
  }
};
