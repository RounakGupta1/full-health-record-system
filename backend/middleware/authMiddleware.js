const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET || "secretkey";

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : authHeader;

  if (!token) {
    return res.status(401).json({ message: "No token" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (!decoded.id || !mongoose.Types.ObjectId.isValid(decoded.id)) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const user = await User.findById(decoded.id).select("_id role isApproved isBlocked").lean();

    if (!user) {
      return res.status(401).json({ message: "Not authorized" });
    }

    if (decoded.role !== undefined && decoded.role !== user.role) {
      return res.status(401).json({ message: "Not authorized" });
    }

    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked" });
    }

    if (!user.isApproved) {
      return res.status(403).json({ message: "Account pending admin approval" });
    }

    req.user = String(user._id);
    req.userRole = user.role;

    return next();
  } catch (error) {
    return res.status(401).json({ message: "Not authorized" });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!req.userRole || !roles.includes(req.userRole)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  return next();
};

module.exports = protect;
module.exports.authorize = authorize;
