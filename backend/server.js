require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/auth");
const patientRoutes = require("./routes/patient");
const protect = require("./middleware/authMiddleware");
const {
  forgotPassword,
  resetPassword,
} = require("./controllers/autoController");
const {
  predictStructured,
  predictByAge,
} = require("./controllers/predictionController");

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

app.use(cors());
app.use(express.json());

/* ================= DATABASE ================= */
mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
  });

/* ================= ROUTES ================= */
app.use("/api/auth", authRoutes);
app.use("/api/patient", patientRoutes);

/* ================= PASSWORD RESET ================= */
app.post("/forgot-password", forgotPassword);
app.post("/reset-password", resetPassword);

/* ================= AI ================= */
app.post("/predict", protect, predictStructured);
app.post("/api/predict", protect, predictStructured);
app.get("/api/predict/:age", protect, predictByAge);

/* ================= FRONTEND ================= */

// Absolute path fix (important)
const frontendPath = path.join(__dirname, "../frontend");

// Serve static files
app.use(express.static(frontendPath));

// Catch-all route (must be LAST)
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

/* ================= SERVER ================= */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});