const MAX_LEN = 160;

const BLOOD_GROUPS = new Set([
  "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown",
]);

const GENDERS = new Set(["male", "female", "other"]);

function stripHtml(value) {
  return String(value ?? "").replace(/[<>]/g, "");
}

function sanitizeString(value, maxLen = MAX_LEN) {
  const s = stripHtml(value).trim().slice(0, maxLen);
  return s;
}

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

function validateEmailFormat(email) {
  if (!email || email.length > 254) return "Invalid email.";
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email) ? null : "Invalid email format.";
}

/**
 * Minimum 8 chars, at least one letter and one number.
 */
function validatePasswordStrength(password) {
  const p = String(password ?? "");

  if (p.length < 8) return "Password must be at least 8 characters.";
  if (p.length > 128) return "Password too long.";
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) {
    return "Password must include at least one letter and one number.";
  }

  return null;
}

function validatePatientAge(age) {
  const n = Number(age);

  if (!Number.isFinite(n) || n < 0 || n > 130) {
    return "Age must be a number between 0 and 130.";
  }

  return null;
}

function validateDoctorExperience(years) {
  const n = Number(years);

  if (!Number.isFinite(n) || n < 0 || n > 65) {
    return "Experience must be between 0 and 65 years.";
  }

  return null;
}

function validatePhoneDigits(phone) {
  const d = String(phone ?? "").replace(/\D/g, "");

  if (d.length < 8 || d.length > 15) return "Enter a phone number with 8–15 digits.";
  return null;
}

module.exports = {
  BLOOD_GROUPS,
  GENDERS,
  sanitizeString,
  normalizeEmail,
  validateEmailFormat,
  validatePasswordStrength,
  validatePatientAge,
  validateDoctorExperience,
  validatePhoneDigits,
};
