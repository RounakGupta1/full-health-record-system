const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const GENDER_ENUM = ["male", "female", "other", "prefer_not"];

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 254,
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
    select: false,
  },
  role: {
    type: String,
    enum: ["admin", "doctor", "patient"],
    default: "patient",
    required: true,
  },
  /** Shared contact (patients / doctors) */
  phone: {
    type: String,
    default: "",
    trim: true,
    maxlength: 32,
  },
  /** Patient profile */
  patientAge: {
    type: Number,
    default: null,
    min: 0,
    max: 130,
  },
  gender: {
    type: String,
    enum: GENDER_ENUM,
    default: "prefer_not",
  },
  bloodGroup: {
    type: String,
    default: "",
    trim: true,
    maxlength: 8,
  },
  /** Doctor profile */
  specialization: {
    type: String,
    default: "",
    trim: true,
    maxlength: 160,
  },
  experienceYears: {
    type: Number,
    default: null,
    min: 0,
    max: 65,
  },
  licenseNumber: {
    type: String,
    default: "",
    trim: true,
    maxlength: 64,
  },
  isApproved: {
    type: Boolean,
    default: true,
  },
  isBlocked: {
    type: Boolean,
    default: false,
  },
  resetPasswordToken: {
    type: String,
    default: null,
    select: false,
  },
  resetPasswordExpires: {
    type: Date,
    default: null,
    select: false,
  },
}, { timestamps: true });

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", UserSchema);
