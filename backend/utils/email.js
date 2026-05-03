const nodemailer = require("nodemailer");

const createTransporter = async () => {
  return nodemailer.createTransport({
    service: "gmail",

    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },

    connectionTimeout: 60000,
    greetingTimeout: 60000,
    socketTimeout: 60000,
  });
};

const sendPasswordResetEmail = async ({ to, resetLink }) => {
  const transporter = await createTransporter();

  await transporter.sendMail({
    from: process.env.SMTP_USER,

    to,

    subject: "Password Reset",

    text: `
You requested a password reset.

Open this link:
${resetLink}
`,

    html: `
<p>You requested a password reset.</p>

<p>
  <a href="${resetLink}">
    Reset Password
  </a>
</p>
`,
  });

  return { sent: true };
};

module.exports = {
  sendPasswordResetEmail,
};

