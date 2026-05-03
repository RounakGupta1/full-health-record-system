const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 587,
  secure: false,

  requireTLS: true,

  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },

  tls: {
    rejectUnauthorized: false,
  },
});

const sendPasswordResetEmail = async ({ to, resetLink }) => {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: "Password Reset",

    html: `
      <h2>Password Reset</h2>
      <p>Click below to reset your password:</p>
      <a href="${resetLink}">Reset Password</a>
    `,
  });

  return { sent: true };
};

module.exports = {
  sendPasswordResetEmail,
};

