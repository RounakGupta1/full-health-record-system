const express = require("express");
const router = express.Router();

const protect = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/authMiddleware");

const {
  listUsersForAdmin,
  patchUserAdmin,
  deleteUserAdmin,
} = require("../controllers/adminController");

router.get("/users", protect, authorize("admin"), listUsersForAdmin);

router.patch("/users/:id", protect, authorize("admin"), patchUserAdmin);

router.delete("/users/:id", protect, authorize("admin"), deleteUserAdmin);

module.exports = router;
