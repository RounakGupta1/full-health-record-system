const router = require("express").Router();
const {
    registerUser,
    loginUser,
    forgotPassword,
    resetPassword,
} = require("../controllers/autoController");

/* REGISTER */
router.post("/register", registerUser);

/* LOGIN */
router.post("/login", loginUser);

/* PASSWORD RESET */
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

module.exports = router;
