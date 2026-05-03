
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",

  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendPasswordResetEmail = async ({ to, resetLink }) => {
  await transporter.sendMail({
    from: process.env.SMTP_USER,

    to,

    subject: "Password Reset",

    html: `
      <h2>Password Reset</h2>
      <p>Click below to reset password:</p>
      <a href="${resetLink}">Reset Password</a>
    `,
  });

  return { sent: true };
};

module.exports = {
  sendPasswordResetEmail,
};

