const express = require("express");
const router = express.Router();
const {
  addPatient,
  updatePatient,
  deletePatient,
  getPatients,
} = require("../controllers/patientController");

const protect = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/authMiddleware");

// Protected routes
router.post("/add", protect, authorize("patient", "admin"), addPatient);
router.put("/update/:id", protect, authorize("patient", "admin"), updatePatient);
router.delete("/delete/:id", protect, authorize("patient", "admin"), deletePatient);
router.get("/all", protect, authorize("patient", "admin"), getPatients);

module.exports = router;
