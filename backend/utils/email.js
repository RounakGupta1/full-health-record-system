const nodemailer = require("nodemailer");
const dns = require("dns");

dns.setDefaultResultOrder("ipv4first");

const createTransporter = () => {
  return nodemailer.createTransport({
    service: "gmail",

    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },

    tls: {
      rejectUnauthorized: false,
    },

    family: 4,
  });
};

const sendPasswordResetEmail = async ({ to, resetLink }) => {
  const appName = process.env.APP_NAME || "HealthSys";

  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"${appName}" <${process.env.SMTP_USER}>`,
    to,

    subject: `${appName} Password Reset`,

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
