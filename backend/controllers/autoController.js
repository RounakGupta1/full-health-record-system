/**
 * Legacy barrel: password-reset flows only (auth/register/login moved to authController).
 */
const User = require("../models/User");
const crypto = require("crypto");
const { sendPasswordResetEmail } = require("../utils/email");
const { validatePasswordStrength } = require("../middleware/registerValidation");

const RESET_TOKEN_EXPIRY_MINUTES = 15;
const GENERIC_RESET_MESSAGE = "If an account with that email exists, a password reset link has been sent.";

const hashResetToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

const getResetLink = (token) => {
  const clientUrl =
    process.env.CLIENT_URL ||
    process.env.FRONTEND_URL ||
    "http://localhost:5000";

  return `${clientUrl.replace(/\/$/, "")}/reset-password.html?token=${encodeURIComponent(token)}`;
};

exports.hashResetToken = hashResetToken;
exports.getResetLink = getResetLink;

exports.forgotPassword = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();

    if (email) {
      const user = await User.findOne({ email }).select("+resetPasswordToken +resetPasswordExpires");

      if (user) {
        const resetToken = crypto.randomBytes(32).toString("hex");

        user.resetPasswordToken = hashResetToken(resetToken);
        user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000);

        await user.save({ validateBeforeSave: false });

        const resetLink = getResetLink(resetToken);

        if (process.env.DEBUG_EMAIL === "1") {
          console.log("RESET LINK:", resetLink);
        }

        try {
          await sendPasswordResetEmail({
            to: user.email,
            resetLink,
          });
        } catch (emailError) {
          console.error("Password reset email failed:", emailError);
        }
      }
    }

    return res.json({ msg: GENERIC_RESET_MESSAGE });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ msg: "Unable to process password reset request" });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const token = String(req.body.token || "").trim();
    const rawPassword = String(req.body.password || "");

    const pwdErr = validatePasswordStrength(rawPassword);

    if (!token || pwdErr) {
      return res.status(400).json({ msg: pwdErr || "Token and valid password required" });
    }

    const hashedToken = hashResetToken(token);

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    }).select("+resetPasswordToken +resetPasswordExpires +password");

    if (!user) {
      return res.status(400).json({ msg: "Reset link is invalid or expired" });
    }

    user.password = rawPassword.trim();
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;

    await user.save();

    return res.json({ msg: "Password reset successful" });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).json({ msg: "Unable to reset password" });
  }
};
