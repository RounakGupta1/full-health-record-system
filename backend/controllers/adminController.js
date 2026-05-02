const mongoose = require("mongoose");
const User = require("../models/User");
const Appointment = require("../models/Appointment");

exports.listUsersForAdmin = async (req, res) => {
  try {
    const users = await User.find({})
      .select(
        "_id name email role isApproved isBlocked createdAt phone specialization experienceYears licenseNumber patientAge gender bloodGroup",
      )
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      users: users.map((u) => ({
        id: String(u._id),
        name: u.name,
        email: u.email,
        role: u.role,
        isApproved: !!u.isApproved,
        isBlocked: !!u.isBlocked,
        createdAt: u.createdAt,
        phone: u.phone || "",
        specialization: u.specialization || "",
        experienceYears: u.experienceYears,
        licenseNumber: u.licenseNumber || "",
        patientAge: u.patientAge,
        gender: u.gender || "",
        bloodGroup: u.bloodGroup || "",
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Unable to load users" });
  }
};

exports.patchUserAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.user;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ msg: "Invalid user id" });
    }

    if (String(id) === String(uid)) {
      return res.status(400).json({ msg: "You cannot change your own account here" });
    }

    const { isApproved, isBlocked } = req.body;

    if (typeof isApproved !== "boolean" && typeof isBlocked !== "boolean") {
      return res.status(400).json({ msg: "Send isApproved and/or isBlocked" });
    }

    const target = await User.findById(id);

    if (!target) {
      return res.status(404).json({ msg: "User not found" });
    }

    if (target.role === "admin" && typeof isBlocked === "boolean" && isBlocked) {
      return res.status(400).json({ msg: "Admin accounts cannot be blocked from this panel" });
    }

    if (typeof isApproved === "boolean") {
      target.isApproved = isApproved;
    }

    if (typeof isBlocked === "boolean") {
      target.isBlocked = isBlocked;
    }

    await target.save();

    return res.json({
      msg: "User updated",
      user: {
        id: String(target._id),
        name: target.name,
        email: target.email,
        role: target.role,
        isApproved: target.isApproved,
        isBlocked: target.isBlocked,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Update failed" });
  }
};

exports.deleteUserAdmin = async (req, res) => {
  console.log("Delete request for:", req.params.id);

  try {
    const rawId = String(req.params.id || "").trim();
    const uid = req.user;

    if (!mongoose.Types.ObjectId.isValid(rawId)) {
      return res.status(400).json({ success: false, msg: "Invalid user id" });
    }

    if (String(rawId) === String(uid)) {
      return res.status(403).json({ success: false, msg: "You cannot delete your own account" });
    }

    const target = await User.findById(rawId).lean();

    if (!target) {
      return res.status(404).json({ success: false, msg: "User not found" });
    }

    if (target.role === "admin") {
      return res.status(403).json({
        success: false,
        msg: "Admin accounts cannot be deleted from this panel",
      });
    }

    try {
      await Appointment.deleteMany({
        $or: [{ patientId: rawId }, { doctorId: rawId }],
      });
    } catch (cleanupErr) {
      console.log(cleanupErr);
    }

    const deleted = await User.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ success: false, msg: "User not found" });
    }

    console.log("User deleted");

    return res.json({ success: true });
  } catch (err) {
    console.log(err);

    return res.status(500).json({ success: false, msg: "Failed to delete user" });
  }
};
