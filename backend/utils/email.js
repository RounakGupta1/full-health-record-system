const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,

  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
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

