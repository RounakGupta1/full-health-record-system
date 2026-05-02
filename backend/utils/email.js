const nodemailer = require("nodemailer");
const dns = require("dns");

dns.setDefaultResultOrder("ipv4first");

const hasSmtpConfig = () =>
  Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);

const createTransporter = () =>
  nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    family: 4,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

const sendPasswordResetEmail = async ({ to, resetLink }) => {
  const appName = process.env.APP_NAME || "HealthSys";

  const from =
    process.env.SMTP_FROM ||
    `"${appName}" <${process.env.SMTP_USER}>`;

  const transporter = createTransporter();

  await transporter.sendMail({
    from,
    to,
    subject: `${appName} password reset`,

    text: `
You requested a password reset.

Open this link:
${resetLink}
`,

    html: `
<p>You requested a password reset.</p>
<p><a href="${resetLink}">Reset Password</a></p>
`,
  });

  return { sent: true };
};

module.exports = {
  sendPasswordResetEmail,
};