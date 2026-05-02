const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  scheduledAt: {
    type: Date,
    required: true,
    index: true,
  },
  reason: {
    type: String,
    required: true,
    trim: true,
  },
  symptoms: {
    type: String,
    default: "",
    trim: true,
  },
  phone: {
    type: String,
    default: "",
    trim: true,
  },
  patientAge: {
    type: Number,
    default: null,
    min: 0,
    max: 130,
  },
  gender: {
    type: String,
    enum: ["male", "female", "other", "prefer_not"],
    default: "prefer_not",
  },
  status: {
    type: String,
    enum: ["pending", "approved", "completed", "cancelled"],
    default: "pending",
    index: true,
  },
  notes: {
    type: String,
    default: "",
    trim: true,
  },
}, { timestamps: true });

appointmentSchema.index({ doctorId: 1, scheduledAt: 1, status: 1 });
appointmentSchema.index({ patientId: 1, scheduledAt: -1 });

module.exports = mongoose.model("Appointment", appointmentSchema);

