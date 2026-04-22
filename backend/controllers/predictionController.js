const SYMPTOM_WEIGHTS = {
  chest_pain: {
    label: "chest pain",
    weight: 32,
    suggestion: "Chest pain can be urgent. Arrange prompt clinical review, especially if it is severe, spreading, or paired with sweating or breathlessness.",
  },
  shortness_of_breath: {
    label: "shortness of breath",
    weight: 28,
    suggestion: "Track oxygen level if available and seek medical assessment if breathing difficulty is new, worsening, or occurs at rest.",
  },
  fever: {
    label: "fever",
    weight: 13,
    suggestion: "Maintain hydration, monitor temperature, and consider infection screening if fever persists or is paired with cough or weakness.",
  },
  cough: {
    label: "cough",
    weight: 9,
    suggestion: "Monitor cough duration and breathing comfort. Persistent cough with fever may need respiratory evaluation.",
  },
  fatigue: {
    label: "fatigue",
    weight: 8,
    suggestion: "Review sleep, hydration, nutrition, and recent illness. Persistent fatigue may need blood pressure, glucose, or blood tests.",
  },
  dizziness: {
    label: "dizziness",
    weight: 12,
    suggestion: "Check blood pressure, hydration, and recent medication changes. Avoid driving if dizziness is active.",
  },
  headache: {
    label: "headache",
    weight: 7,
    suggestion: "Monitor headache severity and triggers. Sudden severe headache or neurological symptoms need urgent review.",
  },
  nausea: {
    label: "nausea",
    weight: 6,
    suggestion: "Small fluids and light food may help. Escalate if nausea is persistent, severe, or paired with abdominal pain.",
  },
  swelling: {
    label: "swelling",
    weight: 14,
    suggestion: "New leg or body swelling should be reviewed, especially with breathlessness, heart history, or kidney disease.",
  },
  weight_loss: {
    label: "unexplained weight loss",
    weight: 18,
    suggestion: "Unexplained weight loss should be discussed with a clinician and tracked with appetite, fever, and fatigue patterns.",
  },
  high_blood_pressure: {
    label: "high blood pressure",
    weight: 20,
    suggestion: "Recheck blood pressure at rest and keep a log. High readings with headache, chest pain, or breathlessness need urgent care.",
  },
  high_blood_sugar: {
    label: "high blood sugar",
    weight: 18,
    suggestion: "Track glucose readings, hydration, diet, and medication adherence. Very high readings or confusion need urgent review.",
  },
};

const HISTORY_WEIGHTS = {
  diabetes: {
    label: "diabetes",
    weight: 20,
    suggestion: "Prioritize glucose monitoring, foot care, hydration, and medication adherence.",
  },
  hypertension: {
    label: "hypertension",
    weight: 18,
    suggestion: "Track blood pressure regularly and reduce salt, missed doses, and stimulant triggers where applicable.",
  },
  heart_disease: {
    label: "heart disease",
    weight: 26,
    suggestion: "Heart history increases risk. Chest pain, breathlessness, or swelling should be reviewed quickly.",
  },
  asthma: {
    label: "asthma",
    weight: 12,
    suggestion: "Keep rescue medication available and watch for wheezing, night symptoms, or breathlessness at rest.",
  },
  kidney_disease: {
    label: "kidney disease",
    weight: 22,
    suggestion: "Monitor swelling, blood pressure, urine changes, and medication safety with a clinician.",
  },
  stroke: {
    label: "stroke history",
    weight: 24,
    suggestion: "Any new weakness, speech change, facial droop, or confusion should be treated as urgent.",
  },
  smoking: {
    label: "smoking",
    weight: 15,
    suggestion: "Smoking increases cardiovascular and respiratory risk. Cutting down or quitting would meaningfully lower risk.",
  },
  obesity: {
    label: "obesity",
    weight: 13,
    suggestion: "Gradual activity, nutrition review, and weight tracking can reduce long-term metabolic and cardiovascular risk.",
  },
};

const KNOWN_SYMPTOM_ALIASES = {
  breathlessness: "shortness_of_breath",
  "shortness of breath": "shortness_of_breath",
  sob: "shortness_of_breath",
  "chest pain": "chest_pain",
  chestpain: "chest_pain",
  tiredness: "fatigue",
  tired: "fatigue",
  "weight loss": "weight_loss",
  "blood pressure": "high_blood_pressure",
  bp: "high_blood_pressure",
  hypertension: "high_blood_pressure",
  sugar: "high_blood_sugar",
  glucose: "high_blood_sugar",
  diabetes: "high_blood_sugar",
};

const KNOWN_HISTORY_ALIASES = {
  bp: "hypertension",
  "blood pressure": "hypertension",
  high_blood_pressure: "hypertension",
  "heart disease": "heart_disease",
  cardiac: "heart_disease",
  kidney: "kidney_disease",
  "kidney disease": "kidney_disease",
  smoker: "smoking",
  tobacco: "smoking",
  overweight: "obesity",
};

const normalizeText = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "");

const toList = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    return value
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const normalizeList = (value, aliases, weights) => {
  const seen = new Set();

  return toList(value)
    .map((item) => {
      const raw = String(item || "").trim().toLowerCase();
      const normalized = normalizeText(raw);
      return aliases[raw] || aliases[normalized] || normalized;
    })
    .filter((item) => {
      if (!weights[item] || seen.has(item)) {
        return false;
      }

      seen.add(item);
      return true;
    });
};

const getAgeScore = (age) => {
  if (age >= 75) return 28;
  if (age >= 60) return 22;
  if (age >= 45) return 14;
  if (age >= 30) return 7;
  return 2;
};

const classifyRisk = (score) => {
  if (score >= 70) return "high";
  if (score >= 38) return "medium";
  return "low";
};

const getConfidence = ({ symptoms, history, score }) => {
  const inputDepth = Math.min(32, symptoms.length * 9 + history.length * 8);
  const distanceFromBoundary = Math.min(
    Math.abs(score - 38),
    Math.abs(score - 70)
  );
  const boundaryConfidence = Math.min(18, distanceFromBoundary * 0.6);

  return Math.max(58, Math.min(96, Math.round(58 + inputDepth + boundaryConfidence)));
};

const buildSuggestions = ({ riskLevel, symptomDetails, historyDetails, age }) => {
  const suggestions = [];

  symptomDetails
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .forEach((item) => suggestions.push(item.suggestion));

  historyDetails
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 2)
    .forEach((item) => suggestions.push(item.suggestion));

  if (age >= 60) {
    suggestions.push("Because age increases baseline risk, schedule regular follow-up and keep recent vitals and medication lists updated.");
  }

  if (riskLevel === "high") {
    suggestions.unshift("This profile needs timely clinical review. Escalate urgently if symptoms are severe, sudden, or worsening.");
  } else if (riskLevel === "medium") {
    suggestions.unshift("Arrange a routine clinical check and monitor symptoms over the next 24-48 hours.");
  } else {
    suggestions.unshift("Risk appears low from the provided data. Continue monitoring and update the record if symptoms change.");
  }

  return [...new Set(suggestions)].slice(0, 5);
};

const predictHealthRisk = (input) => {
  const age = Number(input.age);

  if (!Number.isFinite(age) || age < 0 || age > 130) {
    const error = new Error("Age must be a valid number between 0 and 130");
    error.status = 400;
    throw error;
  }

  const symptoms = normalizeList(input.symptoms, KNOWN_SYMPTOM_ALIASES, SYMPTOM_WEIGHTS);
  const history = normalizeList(input.history, KNOWN_HISTORY_ALIASES, HISTORY_WEIGHTS);
  const symptomDetails = symptoms.map((key) => SYMPTOM_WEIGHTS[key]);
  const historyDetails = history.map((key) => HISTORY_WEIGHTS[key]);
  const ageScore = getAgeScore(age);
  const symptomScore = symptomDetails.reduce((total, item) => total + item.weight, 0);
  const historyScore = historyDetails.reduce((total, item) => total + item.weight, 0);

  let interactionScore = 0;
  const hasSymptom = (key) => symptoms.includes(key);
  const hasHistory = (key) => history.includes(key);

  if (hasSymptom("chest_pain") && hasSymptom("shortness_of_breath")) interactionScore += 18;
  if (hasHistory("heart_disease") && (hasSymptom("chest_pain") || hasSymptom("shortness_of_breath"))) interactionScore += 16;
  if (hasHistory("diabetes") && hasSymptom("high_blood_sugar")) interactionScore += 12;
  if (hasHistory("hypertension") && hasSymptom("high_blood_pressure")) interactionScore += 10;
  if (age >= 60 && history.length > 0) interactionScore += 8;

  const rawScore = ageScore + symptomScore + historyScore + interactionScore;
  const score = Math.max(0, Math.min(100, rawScore));
  const riskLevel = classifyRisk(score);
  const confidence = getConfidence({ symptoms, history, score });
  const topFactors = [
    { label: `age ${age}`, impact: ageScore },
    ...symptomDetails.map((item) => ({ label: item.label, impact: item.weight })),
    ...historyDetails.map((item) => ({ label: item.label, impact: item.weight })),
  ].sort((a, b) => b.impact - a.impact).slice(0, 5);

  const explanation = topFactors.length > 0
    ? `Risk is ${riskLevel} because the strongest factors are ${topFactors.map((item) => item.label).join(", ")}.`
    : `Risk is ${riskLevel} based on the age provided and no recognized symptoms or history.`;

  return {
    riskLevel,
    confidence,
    score,
    prediction: `${riskLevel.charAt(0).toUpperCase()}${riskLevel.slice(1)} Risk`,
    explanation,
    suggestions: buildSuggestions({ riskLevel, symptomDetails, historyDetails, age }),
    factors: topFactors,
    normalizedInput: {
      age,
      symptoms,
      history,
    },
  };
};

const predictStructured = (req, res) => {
  try {
    const result = predictHealthRisk(req.body || {});
    return res.json(result);
  } catch (err) {
    return res.status(err.status || 500).json({ msg: err.message || "Prediction failed" });
  }
};

const predictByAge = (req, res) => {
  try {
    const age = Number(req.params.age);

    if (!Number.isFinite(age) || age < 0 || age > 130) {
      return res.status(400).json({ msg: "Age must be a valid number between 0 and 130" });
    }

    const isHighRisk = age >= 35;
    const result = isHighRisk ? "High Risk" : "Low Risk";

    return res.json({
      result,
      riskLevel: isHighRisk ? "high" : "low",
      confidence: 72,
      explanation: `Legacy age-only prediction uses age ${age} as the only available signal.`,
      suggestions: [
        isHighRisk
          ? "Add symptoms and medical history in the structured AI form for a more precise assessment."
          : "Risk appears low from age alone. Add symptoms and history if anything changes.",
      ],
    });
  } catch (err) {
    return res.status(err.status || 500).json({ msg: err.message || "Prediction failed" });
  }
};

module.exports = {
  predictHealthRisk,
  predictStructured,
  predictByAge,
};
