const router = require("express").Router();
const protect = require("../middleware/authMiddleware");
const {
  registerPatient,
  registerDoctor,
  loginUser,
  getCurrentUser,
} = require("../controllers/authController");
const {
  forgotPassword,
  resetPassword,
} = require("../controllers/autoController");

router.post("/register/patient", registerPatient);
router.post("/register/doctor", registerDoctor);
router.post("/register", registerPatient);

router.post("/login", loginUser);

router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

router.get("/me", protect, getCurrentUser);

module.exports = router;
