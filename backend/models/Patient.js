const mongoose = require("mongoose");

const patientSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    age: {
        type: Number,
        required: true,
        min: 0
    },
    disease: {
        type: String,
        required: true,
        trim: true
    }
}, { timestamps: true });

patientSchema.index({ user_id: 1, createdAt: -1 });

module.exports = mongoose.model("Patient", patientSchema);
