const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const User = require("../models/User");

/** Shown when a doctor account has no name or legacy data omits it */
const DEFAULT_DOCTOR_NAME = "Dr. General Physician";

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const parseScheduledAt = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const serializeAppointment = (appointment) => {
  const dDoc = appointment.doctorId;
  const doctor =
    dDoc && typeof dDoc === "object" && dDoc._id
      ? {
        id: String(dDoc._id),
        name: (dDoc.name && String(dDoc.name).trim()) || DEFAULT_DOCTOR_NAME,
        email: dDoc.email || "",
      }
      : undefined;

  return {
    id: String(appointment._id),
    patientId: String(appointment.patientId?._id || appointment.patientId),
    doctorId: String(appointment.doctorId?._id || appointment.doctorId),
    scheduledAt: appointment.scheduledAt,
    reason: appointment.reason,
    symptoms: appointment.symptoms,
    phone: appointment.phone || "",
    patientAge: appointment.patientAge == null ? null : Number(appointment.patientAge),
    gender: appointment.gender || "prefer_not",
    status: appointment.status,
    notes: appointment.notes,
    createdAt: appointment.createdAt,
    patient: appointment.patientId && appointment.patientId.name ? {
      id: String(appointment.patientId._id),
      name: appointment.patientId.name,
      email: appointment.patientId.email,
    } : undefined,
    doctor,
  };
};

exports.listDoctors = async (req, res) => {
  try {
    const doctors = await User.find({
      role: "doctor",
      isApproved: true,
      isBlocked: false,
    }).select("_id name email specialization").sort({ createdAt: -1 }).lean();

    return res.json({
      doctors: doctors.map((d) => ({
        id: String(d._id),
        name: (d.name && String(d.name).trim()) || DEFAULT_DOCTOR_NAME,
        email: d.email,
        specialization: d.specialization || "",
      })),
    });
  } catch (err) {
    return res.status(500).json({ msg: "Unable to load doctors" });
  }
};

exports.createAppointment = async (req, res) => {
  try {
    const { doctorId, scheduledAt, reason, symptoms, phone, patientAge, gender } = req.body || {};

    if (!doctorId || !isValidObjectId(doctorId)) {
      return res.status(400).json({ msg: "Valid doctor is required" });
    }

    const when = parseScheduledAt(scheduledAt);
    if (!when) {
      return res.status(400).json({ msg: "Valid date/time is required" });
    }

    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ msg: "Reason is required" });
    }

    const phoneClean = String(phone || "").trim();
    if (!phoneClean || phoneClean.length < 8) {
      return res.status(400).json({ msg: "Valid phone number is required" });
    }

    const ageNum = Number(patientAge);
    if (!Number.isFinite(ageNum) || ageNum < 0 || ageNum > 130) {
      return res.status(400).json({ msg: "Valid age is required" });
    }

    const allowedGenders = ["male", "female", "other"];
    const genderClean = String(gender || "").trim().toLowerCase();
    if (!allowedGenders.includes(genderClean)) {
      return res.status(400).json({ msg: "Please select gender" });
    }

    const doctor = await User.findOne({
      _id: doctorId,
      role: "doctor",
      isApproved: true,
      isBlocked: false,
    }).select("_id").lean();

    if (!doctor) {
      return res.status(404).json({ msg: "Doctor not found" });
    }

    const start = new Date(when);
    start.setSeconds(0, 0);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 30);

    const existing = await Appointment.findOne({
      doctorId,
      scheduledAt: { $gte: start, $lt: end },
      status: { $in: ["pending", "approved"] },
    }).select("_id").lean();

    if (existing) {
      return res.status(409).json({ msg: "That slot is already booked. Choose another time." });
    }

    const appointment = await Appointment.create({
      patientId: req.user,
      doctorId,
      scheduledAt: start,
      reason: String(reason).trim(),
      symptoms: String(symptoms || "").trim(),
      phone: phoneClean,
      patientAge: ageNum,
      gender: genderClean,
      status: "pending",
    });

    return res.json({
      msg: "Appointment requested",
      appointment: serializeAppointment(appointment),
    });
  } catch (err) {
    return res.status(500).json({ msg: "Unable to book appointment" });
  }
};

exports.getAppointmentById = async (req, res) => {
  try {
    const id = String(req.params.id || "");
    if (!isValidObjectId(id)) {
      return res.status(400).json({ msg: "Invalid appointment id" });
    }

    const appointment = await Appointment.findById(id)
      .populate("patientId", "name email")
      .populate("doctorId", "name email")
      .lean();

    if (!appointment) {
      return res.status(404).json({ msg: "Appointment not found" });
    }

    const role = req.userRole;
    const uid = String(req.user);
    const patientId = String(appointment.patientId?._id || appointment.patientId);
    const doctorId = String(appointment.doctorId?._id || appointment.doctorId);

    if (role === "admin" || patientId === uid || doctorId === uid) {
      return res.json({ appointment: serializeAppointment(appointment) });
    }

    return res.status(403).json({ msg: "Forbidden" });
  } catch (err) {
    return res.status(500).json({ msg: "Unable to load appointment" });
  }
};

exports.listMyAppointments = async (req, res) => {
  try {
    const items = await Appointment.find({ patientId: req.user })
      .populate("doctorId", "name email")
      .sort({ scheduledAt: -1 })
      .limit(25)
      .lean();

    return res.json({ appointments: items.map(serializeAppointment) });
  } catch (err) {
    return res.status(500).json({ msg: "Unable to load appointments" });
  }
};

exports.listDoctorAppointments = async (req, res) => {
  try {
    const status = String(req.query.status || "").trim().toLowerCase();
    const statusFilter = ["pending", "approved", "completed", "cancelled"].includes(status) ? status : null;

    const query = { doctorId: req.user };
    if (statusFilter) query.status = statusFilter;

    const items = await Appointment.find(query)
      .populate("patientId", "name email")
      .sort({ scheduledAt: 1 })
      .limit(50)
      .lean();

    return res.json({ appointments: items.map(serializeAppointment) });
  } catch (err) {
    return res.status(500).json({ msg: "Unable to load appointments" });
  }
};

exports.approveAppointment = async (req, res) => {
  try {
    const id = String(req.params.id || "");
    if (!isValidObjectId(id)) {
      return res.status(400).json({ msg: "Invalid appointment id" });
    }

    const appointment = await Appointment.findOne({
      _id: id,
      doctorId: req.user,
    });

    if (!appointment) {
      return res.status(404).json({ msg: "Appointment not found" });
    }

    if (appointment.status !== "pending") {
      return res.status(409).json({ msg: `Cannot approve a ${appointment.status} appointment` });
    }

    appointment.status = "approved";
    await appointment.save();

    const hydrated = await Appointment.findById(id)
      .populate("patientId", "name email")
      .populate("doctorId", "name email")
      .lean();

    return res.json({
      msg: "Appointment approved",
      appointment: serializeAppointment(hydrated),
    });
  } catch (err) {
    return res.status(500).json({ msg: "Unable to approve appointment" });
  }
};

