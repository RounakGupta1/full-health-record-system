const User = require("../models/User");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { sendPasswordResetEmail } = require("../utils/email");

const JWT_SECRET = process.env.JWT_SECRET || "secretkey";
const RESET_TOKEN_EXPIRY_MINUTES = 15;
const GENERIC_RESET_MESSAGE = "If an account with that email exists, a password reset link has been sent.";

// Generate Token
const generateToken = (id) => {
  return jwt.sign({ id: String(id) }, JWT_SECRET, {
    expiresIn: "1d",
  });
};

// Register
exports.registerUser = async (req, res) => {
  let { name, email, password } = req.body;

  try {
    if (!name || !email || !password) {
      return res.status(400).json({ msg: "Fill all fields" });
    }

    name = name.trim();
    email = email.trim().toLowerCase();

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ msg: "User already exists" });
    }

    const user = await User.create({ name, email, password });

    res.json({
      msg: "Registered Successfully",
      token: generateToken(user._id),
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ msg: "User already exists" });
    }

    res.status(500).json({ msg: "Register error" });
  }
};

// Login
exports.loginUser = async (req, res) => {
  let { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ msg: "Fill all fields" });
    }

    email = email.trim().toLowerCase();

    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      res.json({
        msg: "Login Successful",
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ msg: "Invalid credentials" });
    }
  } catch (err) {
    res.status(500).json({ msg: "Login error" });
  }
};

const hashResetToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

const getResetLink = (token) => {
  const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 5000}`;
  return `${clientUrl.replace(/\/$/, "")}/reset-password.html?token=${encodeURIComponent(token)}`;
};

// Forgot Password
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

        try {
          await sendPasswordResetEmail({
            to: user.email,
            resetLink: getResetLink(resetToken),
          });
        } catch (emailError) {
          console.error("Password reset email failed:", emailError.message);
        }
      }
    }

    return res.json({ msg: GENERIC_RESET_MESSAGE });
  } catch (err) {
    return res.status(500).json({ msg: "Unable to process password reset request" });
  }
};

// Reset Password
exports.resetPassword = async (req, res) => {
  try {
    const token = String(req.body.token || "").trim();
    const password = String(req.body.password || "");

    if (!token || !password || password.length < 6) {
      return res.status(400).json({ msg: "Token and a password of at least 6 characters are required" });
    }

    const hashedToken = hashResetToken(token);
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    }).select("+resetPasswordToken +resetPasswordExpires");

    if (!user) {
      return res.status(400).json({ msg: "Reset link is invalid or expired" });
    }

    user.password = password;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;

    await user.save();

    return res.json({ msg: "Password reset successful. You can now login." });
  } catch (err) {
    return res.status(500).json({ msg: "Unable to reset password" });
  }
};
