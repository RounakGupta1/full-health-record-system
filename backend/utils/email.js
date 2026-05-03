const SibApiV3Sdk = require("sib-api-v3-sdk");

const defaultClient = SibApiV3Sdk.ApiClient.instance;

const apiKey =
  defaultClient.authentications["api-key"];

apiKey.apiKey = process.env.BREVO_API_KEY;

const apiInstance =
  new SibApiV3Sdk.TransactionalEmailsApi();

const sendPasswordResetEmail = async ({
  to,
  resetLink,
}) => {
  await apiInstance.sendTransacEmail({
    sender: {
      email: "rounak30gupta@gmail.com",
      name: "HealthSys",
    },

    to: [
      {
        email: to,
      },
    ],

    subject: "Password Reset",

    htmlContent: `
      <h2>Password Reset</h2>
      <p>Click below to reset your password:</p>
      <a href="${resetLink}">
        Reset Password
      </a>
    `,
  });

  return { sent: true };
};

module.exports = {
  sendPasswordResetEmail,
};

