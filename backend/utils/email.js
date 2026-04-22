const nodemailer = require("nodemailer");

const hasSmtpConfig = () => Boolean(
  process.env.SMTP_HOST &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS
);

const createTransporter = () => nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendPasswordResetEmail = async ({ to, resetLink }) => {
  const appName = process.env.APP_NAME || "HealthSys";
  const from = process.env.SMTP_FROM || `"${appName}" <no-reply@healthsys.local>`;

  if (!hasSmtpConfig()) {
    console.log(`[DEV PASSWORD RESET LINK] ${to}: ${resetLink}`);
    return { sent: false, devLink: resetLink };
  }

  const transporter = createTransporter();

  await transporter.sendMail({
    from,
    to,
    subject: `${appName} password reset`,
    text: [
      `You requested a password reset for ${appName}.`,
      "",
      "Open this link within 15 minutes:",
      resetLink,
      "",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: `
      <p>You requested a password reset for <strong>${appName}</strong>.</p>
      <p>Open this link within 15 minutes:</p>
      <p><a href="${resetLink}">Reset your password</a></p>
      <p>If you did not request this, you can ignore this email.</p>
    `,
  });

  return { sent: true };
};

module.exports = {
  sendPasswordResetEmail,
};
