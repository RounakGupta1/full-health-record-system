import json
import re
import sys


SYMPTOM_WEIGHTS = {
    "chest_pain": 32,
    "shortness_of_breath": 28,
    "fever": 13,
    "cough": 9,
    "fatigue": 8,
    "dizziness": 12,
    "headache": 7,
    "nausea": 6,
    "swelling": 14,
    "weight_loss": 18,
    "high_blood_pressure": 20,
    "high_blood_sugar": 18,
}

HISTORY_WEIGHTS = {
    "diabetes": 20,
    "hypertension": 18,
    "heart_disease": 26,
    "asthma": 12,
    "kidney_disease": 22,
    "stroke": 24,
    "smoking": 15,
    "obesity": 13,
}


def normalize(value):
    return "".join(char.lower() if char.isalnum() else "_" for char in str(value)).strip("_")


def normalize_list(items, weights):
    if isinstance(items, str):
        items = [item.strip() for item in items.replace(";", ",").split(",")]
    elif not isinstance(items, list):
        items = []

    normalized = []
    for item in items:
        key = normalize(item)
        if key in weights and key not in normalized:
            normalized.append(key)
    return normalized


def age_score(age):
    if age >= 75:
        return 28
    if age >= 60:
        return 22
    if age >= 45:
        return 14
    if age >= 30:
        return 7
    return 2


def classify(score):
    if score >= 70:
        return "high"
    if score >= 38:
        return "medium"
    return "low"


def predict(payload):
    age = float(payload.get("age", -1))
    if age < 0 or age > 130:
        raise ValueError("Age must be between 0 and 130")

    symptoms = normalize_list(payload.get("symptoms", []), SYMPTOM_WEIGHTS)
    history = normalize_list(payload.get("history", []), HISTORY_WEIGHTS)
    score = age_score(age)
    score += sum(SYMPTOM_WEIGHTS[item] for item in symptoms)
    score += sum(HISTORY_WEIGHTS[item] for item in history)

    if "chest_pain" in symptoms and "shortness_of_breath" in symptoms:
        score += 18
    if "heart_disease" in history and ("chest_pain" in symptoms or "shortness_of_breath" in symptoms):
        score += 16
    if "diabetes" in history and "high_blood_sugar" in symptoms:
        score += 12
    if "hypertension" in history and "high_blood_pressure" in symptoms:
        score += 10
    if age >= 60 and history:
        score += 8

    score = max(0, min(100, int(score)))
    risk = classify(score)
    confidence = max(58, min(96, 58 + len(symptoms) * 9 + len(history) * 8))

    return {
        "prediction": f"{risk.title()} Risk",
        "riskLevel": risk,
        "confidence": confidence,
        "score": score,
        "explanation": f"Risk is {risk} based on age, symptoms, and medical history.",
        "normalizedInput": {
            "age": age,
            "symptoms": symptoms,
            "history": history,
        },
    }


def parse_payload(raw):
    if not raw.strip().startswith("{"):
        return {"age": raw}

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        age_match = re.search(r"age\s*:\s*([0-9.]+)", raw, re.IGNORECASE)
        symptoms_match = re.search(r"symptoms\s*:\s*\[([^\]]*)\]", raw, re.IGNORECASE)
        history_match = re.search(r"history\s*:\s*\[([^\]]*)\]", raw, re.IGNORECASE)

        def split_items(match):
            if not match:
                return []
            return [item.strip().strip("'\"") for item in match.group(1).split(",") if item.strip()]

        return {
            "age": age_match.group(1) if age_match else -1,
            "symptoms": split_items(symptoms_match),
            "history": split_items(history_match),
        }


def main():
    if len(sys.argv) < 2:
        print("JSON payload or age is required", file=sys.stderr)
        return 1

    raw = " ".join(sys.argv[1:])
    try:
        if raw.strip().startswith("{"):
            print(json.dumps(predict(parse_payload(raw))))
        else:
            age = float(raw)
            result = "High Risk" if age >= 35 else "Low Risk"
            print(json.dumps({
                "prediction": result,
                "riskLevel": "high" if age >= 35 else "low",
                "confidence": 72,
                "score": 70 if age >= 35 else 30,
                "explanation": "Legacy age-only prediction uses age as the only available signal.",
            }))
        return 0
    except Exception as err:
        print(str(err), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
