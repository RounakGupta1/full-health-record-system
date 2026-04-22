const mongoose = require("mongoose");
const Patient = require("../models/Patient");

const getLoggedInUserId = (req, res) => {
  if (!req.user || !mongoose.Types.ObjectId.isValid(req.user)) {
    res.status(401).json({ msg: "Not authorized" });
    return null;
  }

  return req.user;
};

const isValidPatientInput = ({ name, age, disease }) => {
  const parsedAge = Number(age);

  return {
    isValid: Boolean(name && disease && Number.isFinite(parsedAge) && parsedAge >= 0),
    parsedAge,
  };
};

exports.addPatient = async (req, res) => {
  try {
    const userId = getLoggedInUserId(req, res);
    if (!userId) return;

    const { name, age, disease } = req.body;
    const { isValid, parsedAge } = isValidPatientInput({ name, age, disease });

    if (!isValid) {
      return res.status(400).json({ msg: "Fill all fields with a valid age" });
    }

    const patient = await Patient.create({
      user_id: userId,
      name: name.trim(),
      age: parsedAge,
      disease: disease.trim(),
    });

    return res.json({ msg: "Patient Added", patient });
  } catch (err) {
    return res.status(500).json({ msg: "Error adding patient" });
  }
};

exports.updatePatient = async (req, res) => {
  try {
    const userId = getLoggedInUserId(req, res);
    if (!userId) return;

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ msg: "Invalid patient id" });
    }

    const { name, age, disease } = req.body;
    const { isValid, parsedAge } = isValidPatientInput({ name, age, disease });

    if (!isValid) {
      return res.status(400).json({ msg: "Fill all fields with a valid age" });
    }

    const patient = await Patient.findOneAndUpdate(
      {
        _id: req.params.id,
        user_id: userId,
      },
      {
        name: name.trim(),
        age: parsedAge,
        disease: disease.trim(),
      },
      { new: true, runValidators: true }
    );

    if (!patient) {
      return res.status(404).json({ msg: "Patient not found" });
    }

    return res.json({ msg: "Patient Updated", patient });
  } catch (err) {
    return res.status(500).json({ msg: "Update error" });
  }
};

exports.deletePatient = async (req, res) => {
  try {
    const userId = getLoggedInUserId(req, res);
    if (!userId) return;

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ msg: "Invalid patient id" });
    }

    const patient = await Patient.findOneAndDelete({
      _id: req.params.id,
      user_id: userId,
    });

    if (!patient) {
      return res.status(404).json({ msg: "Patient not found" });
    }

    return res.json({ msg: "Patient Deleted" });
  } catch (err) {
    return res.status(500).json({ msg: "Delete error" });
  }
};

exports.getPatients = async (req, res) => {
  try {
    const userId = getLoggedInUserId(req, res);
    if (!userId) return;

    const data = await Patient.find({ user_id: userId }).sort({ createdAt: -1 }).lean();

    return res.json(data);
  } catch (err) {
    return res.status(500).json({ msg: "Fetch error" });
  }
};
