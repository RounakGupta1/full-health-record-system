const path = require("path");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const User = require("./models/User");

const authRoutes = require("./routes/auth");
const patientRoutes = require("./routes/patient");
const appointmentRoutes = require("./routes/appointment");
const adminRoutes = require("./routes/admin");
const protect = require("./middleware/authMiddleware");
const { authorize } = require("./middleware/authMiddleware");
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

/** Default admin (override with ADMIN_EMAIL / ADMIN_PASSWORD in backend/.env if needed) */
const SEED_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@healthsys.com").trim().toLowerCase();
const SEED_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@123";

app.use(cors());
app.use(express.json());

function mongoUriHasDatabaseSegment(uri){
  const trimmed = String(uri || "").trim().split("?")[0];
  const idx = trimmed.lastIndexOf("/");
  const after = idx >= 0 ? trimmed.slice(idx + 1) : "";

  /**
   * `mongodb+srv://host/` has nothing after slash → mongoose uses DB `test`
   */
  return !!after.trim();
}

/**
 * Prints where Mongoose reads/writes so Compass matches the same cluster + database + collection.
 */
function logMongoAndUserDiagnostics() {
  console.log(process.env.MONGO_URI);
  console.log(User.collection.name);

  const dbName = mongoose.connection.db?.databaseName;
  console.log("[Mongo] mongoose.connection.hosts:", mongoose.connection.hosts?.map((h) => `${h.host}:${h.port}`).join(", "));
  console.log("[Mongo] Active database.name:", dbName);
  console.log("[Mongo] Mongoose User modelName:", User.modelName);
  console.log("[Mongo] Resolved collection.collectionName:", User.collection.collectionName);

  const colKeys = mongoose.connection.collections
    ? Object.keys(mongoose.connection.collections)
    : [];

  console.log("[Mongo] Physical collections in this database:", colKeys.sort().join(", ") || "(none listed yet)");

  if(!mongoUriHasDatabaseSegment(process.env.MONGO_URI)){
    console.warn(
      "[Mongo] ⚠️ MONGO_URI path has NO database segment (looks like …mongodb.net/). Mongoose defaults to database `test`. In Compass choose that cluster → **`test`** → collection **`users`** — or append `/yourDbName` to the URI.",
    );
  }else{
    console.log(
      `[Mongo] Open this SAME database (**${dbName}**) → collection (**${User.collection.collectionName || User.collection.name}**) in Compass on the cluster from your URI.`,
    );
  }
}

/** Safe admin row for stdout (never print password hash verbatim) */
async function printAdminMongoSnapshot(label){
  const doc = await User.findOne({ email: SEED_ADMIN_EMAIL }).lean();

  if(!doc){
    console.log("[Mongo]", label, "-- no document for SEED_ADMIN_EMAIL", SEED_ADMIN_EMAIL);
    return;
  }

  const safe = {
    _id: String(doc._id),
    email: doc.email,
    name: doc.name,
    role: doc.role,
    isApproved: doc.isApproved,
    isBlocked: doc.isBlocked,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    passwordStored: typeof doc.password === "string"
      ? `bcrypt (${doc.password.startsWith("$2") ? "hash" : "unknown format"})`
      : "missing",
  };

  console.log("[Mongo]", label, JSON.stringify(safe, null, 2));
}

/**
 * Runs right after MongoDB connects. Hashes password with bcrypt here, then inserts a document
 * via the driver so the User pre-save hook does not double-hash.
 * Login still validates with User.prototype.matchPassword → bcrypt.compare().
 */
async function seedDefaultAdmin() {
  try {
    const email = SEED_ADMIN_EMAIL;

    const existing = await User.findOne({ email });

    if(existing){
      if(existing.role !== "admin"){
        console.log("❌ Admin creation error");
        await printAdminMongoSnapshot("blocked (email belongs to non-admin)");
        return;
      }

      let repaired = false;

      if(!existing.isApproved){
        existing.isApproved = true;
        repaired = true;
      }

      if(existing.isBlocked){
        existing.isBlocked = false;
        repaired = true;
      }

      if(repaired){
        await existing.save();
      }

      console.log("✅ Admin already exists");
      await printAdminMongoSnapshot("existing admin verified");
      return;
    }

    if(String(SEED_ADMIN_PASSWORD).length < 6){
      console.log("❌ Admin creation error");
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(SEED_ADMIN_PASSWORD, salt);
    const now = new Date();

    const insertResult = await User.collection.insertOne({
      name: "System Administrator",
      email,
      password: passwordHash,
      role: "admin",
      isApproved: true,
      isBlocked: false,
      resetPasswordToken: null,
      resetPasswordExpires: null,
      createdAt: now,
      updatedAt: now,
      __v: 0,
    });

    console.log("✅ Admin created insertOne.acknowledged:", insertResult.acknowledged,
      "insertedId:", insertResult.insertedId && String(insertResult.insertedId));
    await printAdminMongoSnapshot("after insert");

    const totalUsers = await User.estimatedDocumentCount();
    console.log("[Mongo] estimatedDocumentCount in", User.collection.collectionName + ":", totalUsers);
  }catch(err){
    console.log("❌ Admin creation error");
    console.error(err);
  }
}

/**
 * Routes (each handler applies JWT + authorize where needed).
 * Patient-only: `/api/patient/*` mutations and `/api/appointments` booking + `/me`.
 * Doctor + admin ops: approve + `/doctor` queues.
 */
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/patient", patientRoutes);
app.use("/api/appointments", appointmentRoutes);

/* ================= PASSWORD RESET ================= */
app.post("/forgot-password", forgotPassword);
app.post("/reset-password", resetPassword);

/* ================= AI ================= */
app.post("/predict", protect, authorize("patient", "admin"), predictStructured);
app.post("/api/predict", protect, authorize("patient", "admin"), predictStructured);
app.get("/api/predict/:age", protect, authorize("patient", "admin"), predictByAge);

/* ================= FRONTEND ================= */

// Absolute path fix (important)
const frontendPath = path.join(__dirname, "../frontend");

// Serve static files
app.use(express.static(frontendPath));

// Catch-all route (must be LAST)
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

/* ================= BOOTSTRAP ================= */
async function startServer() {
  if (!MONGO_URI) {
    console.error("Startup failed: MONGO_URI is not set (check backend/.env).");
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB Connected");

    logMongoAndUserDiagnostics();

    await seedDefaultAdmin();

    const ct = await User.countDocuments({});
    console.log("[Mongo] countDocuments in `" + User.collection.collectionName + "`:", ct);
  } catch (err) {
    console.error("Startup failed:", err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log("Registered: DELETE /api/admin/users/:id (restart Node after route changes)");
  });
}

startServer();
