const express = require("express");
const router = express.Router();
const {
  addPatient,
  updatePatient,
  deletePatient,
  getPatients,
} = require("../controllers/patientController");

const protect = require("../middleware/authMiddleware");

// Protected routes
router.post("/add", protect, addPatient);
router.put("/update/:id", protect, updatePatient);
router.delete("/delete/:id", protect, deletePatient);
router.get("/all", protect, getPatients);

module.exports = router;
