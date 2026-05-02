const express = require("express");
const router = express.Router();

/** JWT on all mutations below */
const protect = require("../middleware/authMiddleware");
/** Role guard helper: authorize("doctor") restricts to practising accounts */
const { authorize } = require("../middleware/authMiddleware");

const {
  listDoctors,
  createAppointment,
  listMyAppointments,
  listDoctorAppointments,
  approveAppointment,
  getAppointmentById,
} = require("../controllers/appointmentController");

router.get("/doctors", protect, authorize("patient", "admin"), listDoctors);

router.post("/", protect, authorize("patient", "admin"), createAppointment);
router.get("/me", protect, authorize("patient", "admin"), listMyAppointments);

router.get("/doctor", protect, authorize("doctor", "admin"), listDoctorAppointments);
router.post("/:id/approve", protect, authorize("doctor", "admin"), approveAppointment);
router.get("/:id", protect, getAppointmentById);

module.exports = router;

