/**
 * API origin. Same host as backend when Express serves frontend (recommended).
 * For Netlify/React static hosting + Render API set:
 * localStorage.setItem("apiBaseUrl", "https://your-api.onrender.com")
 */
const BASE = (() => {
    const saved = localStorage.getItem("apiBaseUrl");

    if(saved){
        return saved.replace(/\/$/, "");
    }

    if(window.location.protocol === "file:"){
        return "http://localhost:5000";
    }

    return window.location.origin;
})();
const API_REGISTRATION_PATIENT = "/api/auth/register/patient";
const API_REGISTRATION_DOCTOR = "/api/auth/register/doctor";
const THEME_STORAGE_KEY = "healthsys-theme";
const DEFAULT_DOCTOR_DISPLAY_NAME = "Dr. General Physician";

function doctorDisplayLabel(name){
    const s = name == null ? "" : String(name).trim();
    return s || DEFAULT_DOCTOR_DISPLAY_NAME;
}

let chartInstance = null;
let latestPatients = [];
let doctorGrowthChartInst = null;

let toastHost = null;

function ensureToastHost(){
    if(toastHost){
        return toastHost;
    }

    toastHost = document.getElementById("toastHost");

    if(!toastHost){
        toastHost = document.createElement("div");
        toastHost.id = "toastHost";
        toastHost.className = "toast-host";
        document.body.appendChild(toastHost);
    }

    return toastHost;
}

function toast(message, variant = "info", timeoutMs = 3200){
    const host = ensureToastHost();
    const item = document.createElement("div");
    item.className = `toast ${variant}`;

    const icon = document.createElement("span");
    icon.className = "toast-dot";

    const text = document.createElement("div");
    text.className = "toast-text";
    text.textContent = message;

    const close = document.createElement("button");
    close.className = "toast-close";
    close.type = "button";
    close.textContent = "×";
    close.addEventListener("click", ()=> item.remove());

    item.appendChild(icon);
    item.appendChild(text);
    item.appendChild(close);
    host.appendChild(item);

    window.setTimeout(()=> {
        item.classList.add("hide");
        window.setTimeout(()=> item.remove(), 250);
    }, timeoutMs);
}

function toastSuccess(message){ toast(message, "success"); }
function toastError(message){ toast(message, "error"); }
function toastInfo(message){ toast(message, "info"); }

function getStoredTheme(){
    return localStorage.getItem(THEME_STORAGE_KEY);
}

function getPreferredTheme(){
    const storedTheme = getStoredTheme();

    if(storedTheme === "light" || storedTheme === "dark"){
        return storedTheme;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme){
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);

    document.querySelectorAll("[data-theme-toggle]").forEach((button)=>{
        const nextTheme = theme === "dark" ? "light" : "dark";
        button.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
        button.textContent = theme === "dark" ? "Light mode" : "Dark mode";
    });

    if(chartInstance){
        renderChart(latestPatients);
    }
}

function toggleTheme(){
    const currentTheme = document.documentElement.getAttribute("data-theme") || getPreferredTheme();
    applyTheme(currentTheme === "dark" ? "light" : "dark");
}

function initTheme(){
    applyTheme(getPreferredTheme());

    document.querySelectorAll("[data-theme-toggle]").forEach((button)=>{
        button.addEventListener("click", toggleTheme);
    });
}

function getToken(){
    return localStorage.getItem("token");
}

const VALID_ACCOUNT_ROLES = ["admin", "doctor", "patient"];

function normalizeRole(role){
    const raw = String(role == null ? "" : role).trim().toLowerCase();
    return VALID_ACCOUNT_ROLES.includes(raw) ? raw : "";
}

const PORTAL_LOGIN_PAGES = {
    patient: "login-patient.html",
    doctor: "login-doctor.html",
    admin: "login-admin.html",
};

const PORTAL_STORAGE_KEY = "healthsys-login-portal";

function loginPageForRole(role){
    const normalized = normalizeRole(role);

    return PORTAL_LOGIN_PAGES[normalized] || "login.html";
}

function setActiveLoginPortal(role){
    const normalized = normalizeRole(role);

    if(PORTAL_LOGIN_PAGES[normalized]){
        localStorage.setItem(PORTAL_STORAGE_KEY, normalized);
    }
}

function getLoginRedirectPage(){
    const stored = localStorage.getItem(PORTAL_STORAGE_KEY);

    return PORTAL_LOGIN_PAGES[stored] || "login.html";
}

function getAuthPortalFromDom(){
    return (document.body && document.body.getAttribute("data-auth-portal")) || "";
}

function syncLoginPortalPreferenceFromDom(){
    const portal = getAuthPortalFromDom();

    if(portal && PORTAL_LOGIN_PAGES[portal]){
        setActiveLoginPortal(portal);
    }
}

function setSession(data){
    if(data.token){
        localStorage.setItem("token", data.token);
    }

    if(data.user){
        const normalized = normalizeRole(data.user.role);

        if(normalized){
            localStorage.setItem("userRole", normalized);
        }

        localStorage.setItem("userName", data.user.name || "");

        if(data.user.email){
            localStorage.setItem("userEmail", data.user.email);
        }

        if(data.user.id){
            localStorage.setItem("userId", data.user.id);
        }
    }
}

/**
 * Sends the user to the dashboard that matches canonical role strings only.
 * @param roleHint optional role from login response or API; defaults to persisted userRole
 */
function goToRoleDashboard(roleHint){
    const resolved = normalizeRole(
        roleHint !== undefined ? roleHint : localStorage.getItem("userRole"),
    );

    let target = "";

    if(resolved === "admin"){
        target = "admin-dashboard.html";
    }else if(resolved === "doctor"){
        target = "doctor-dashboard.html";
    }else if(resolved === "patient"){
        target = "patient-dashboard.html";
    }

    if(!target){
        toastError("Invalid session. Sign in again.");
        logout(false);
        return;
    }

    window.location.replace(target);
}

async function hydrateSessionFromApi(){
    const token = getToken();

    if(!token){
        return { ok: false, role: "" };
    }

    try{
        const res = await fetch(`${BASE}/api/auth/me`, { headers: authHeaders() });
        const data = await res.json().catch(() => ({}));

        if(res.status === 401 || res.status === 403){
            return { ok: false, role: "", forbidden: true };
        }

        if(!res.ok || !data.user){
            return { ok: false, role: "" };
        }

        const nr = normalizeRole(data.user.role);

        if(!nr){
            return { ok: false, role: "" };
        }

        localStorage.setItem("userRole", nr);
        localStorage.setItem("userName", data.user.name || "");

        if(data.user.email){
            localStorage.setItem("userEmail", data.user.email);
        }

        if(data.user.id){
            localStorage.setItem("userId", data.user.id);
        }

        setActiveLoginPortal(nr);
        initDashboardShell();
        return { ok: true, role: nr };
    }catch(_err){
        return { ok: false, role: "" };
    }
}

/**
 * Validates token + role from `/api/auth/me` (authoritative) before loading a dashboard.
 * @returns {Promise<boolean>}
 */
async function bootstrapDashboard(requiredRole){
    if(!getToken()){
        window.location.href = loginPageForRole(requiredRole);
        return false;
    }

    const hydrated = await hydrateSessionFromApi();

    if(!hydrated.ok){
        logout(false);
        return false;
    }

    if(hydrated.role !== requiredRole){
        goToRoleDashboard(hydrated.role);
        return false;
    }

    return true;
}

function initDashboardShell(){
    const nameEl = document.querySelector("[data-profile-name]");
    const roleEl = document.querySelector("[data-profile-role]");
    const name = localStorage.getItem("userName") || "";
    const role = localStorage.getItem("userRole") || "";

    if(nameEl){
        nameEl.textContent = name || (role ? role.charAt(0).toUpperCase() + role.slice(1) : "User");
    }

    if(roleEl){
        roleEl.textContent = role || "—";
    }

    const current = window.location.pathname.split("/").pop();
    document.querySelectorAll(".nav a[href]").forEach((link)=>{
        const href = String(link.getAttribute("href") || "");
        const page = href.split("#")[0].split("/").pop();
        const isActive = page && current && page === current;

        if(isActive){
            link.classList.add("active");
        }else if(page && page.endsWith(".html")){
            link.classList.remove("active");
        }
    });
}

function authHeaders(extraHeaders = {}){
    const token = getToken();

    return {
        ...extraHeaders,
        "Authorization": `Bearer ${token}`
    };
}

async function readJsonResponse(res){
    const data = await res.json().catch(() => ({}));

    if(!res.ok){
        const error = new Error(data.msg || data.message || "Request failed");
        error.status = res.status;
        throw error;
    }

    return data;
}

function handleRequestError(error){
    if(error.status === 401){
        toastError("Session expired. Please login again.");
        logout(false);
        return;
    }

    toastError(error.message || "Something went wrong");
}

function hideLoader(){
    const loader = document.getElementById("loader");

    if(loader){
        loader.style.display = "none";
    }
}

function getCssVar(name){
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function isValidAge(age){
    const parsedAge = Number(age);

    return Number.isFinite(parsedAge) && parsedAge >= 0;
}

/* ================= AUTH CHECK ================= */
function checkAuth(){
    const token = getToken();

    if(!token){
        window.location.href = getLoginRedirectPage();
        return false;
    }

    return true;
}

/* ================= REGISTRATION (dedicated pages) ================= */
function meetsPasswordPolicy(pw){
    const p = String(pw || "");

    return p.length >= 8 && p.length <= 128 && /[A-Za-z]/.test(p) && /\d/.test(p);
}

async function submitPatientRegistration(event){
    event.preventDefault();

    const form = document.getElementById("patientRegisterForm");
    const submitBtn = document.getElementById("patientRegisterSubmit");

    if(!form){
        return;
    }

    const payload = {
        name: document.getElementById("patientRegName")?.value.trim() || "",
        email: String(document.getElementById("patientRegEmail")?.value || "").trim().toLowerCase(),
        password: String(document.getElementById("patientRegPassword")?.value || "").trim(),
        age: Number(document.getElementById("patientRegAge")?.value),
        gender: String(document.getElementById("patientRegGender")?.value || ""),
        phone: document.getElementById("patientRegPhone")?.value.trim() || "",
        bloodGroup: String(document.getElementById("patientRegBloodGroup")?.value || "").trim(),
    };

    clearFormErrorsPatient();

    let fieldError = "";

    if(!payload.name){
        fieldError = "patientRegName";
    }else if(!payload.email){
        fieldError = "patientRegEmail";
    }else if(!meetsPasswordPolicy(payload.password)){
        toastError("Password: 8+ characters with at least one letter and one number.");
        fieldError = "patientRegPassword";
    }else if(!Number.isFinite(payload.age) || payload.age < 0 || payload.age > 130){
        fieldError = "patientRegAge";
    }else if(!payload.gender){
        fieldError = "patientRegGender";
    }else if((()=>{
        const d = payload.phone.replace(/\D/g, "");
        return d.length < 8 || d.length > 15;
    })()){
        fieldError = "patientRegPhone";
    }else if(!payload.bloodGroup){
        fieldError = "patientRegBloodGroup";
    }

    if(fieldError){
        highlightField(fieldError);
        toastError("Please complete every field correctly.");
        return;
    }

    try{
        if(submitBtn){
            submitBtn.disabled = true;
        }

        const res = await fetch(BASE + API_REGISTRATION_PATIENT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        const data = await readJsonResponse(res);

        if(data.token){
            setSession(data);
            setActiveLoginPortal("patient");
            toastSuccess(data.msg || "Welcome to HealthSys");
            goToRoleDashboard();
        }else{
            toastError(data.msg || "Unable to finish registration.");
        }
    }catch(error){
        handleRequestError(error);
    }finally{
        if(submitBtn){
            submitBtn.disabled = false;
        }
    }
}

async function submitDoctorRegistration(event){
    event.preventDefault();

    const form = document.getElementById("doctorRegisterForm");
    const submitBtn = document.getElementById("doctorRegisterSubmit");

    if(!form){
        return;
    }

    clearFormErrorsDoctor();

    const payload = {
        name: document.getElementById("doctorRegName")?.value.trim() || "",
        email: String(document.getElementById("doctorRegEmail")?.value || "").trim().toLowerCase(),
        password: String(document.getElementById("doctorRegPassword")?.value || "").trim(),
        specialization: document.getElementById("doctorRegSpecialization")?.value.trim() || "",
        experienceYears: Number(document.getElementById("doctorRegExperience")?.value),
        phone: document.getElementById("doctorRegPhone")?.value.trim() || "",
        licenseNumber: String(document.getElementById("doctorRegLicense")?.value || "").trim(),
    };

    let fieldError = "";

    if(!payload.name){
        fieldError = "doctorRegName";
    }else if(!payload.email){
        fieldError = "doctorRegEmail";
    }else if(!meetsPasswordPolicy(payload.password)){
        toastError("Password: 8+ characters with at least one letter and one number.");
        fieldError = "doctorRegPassword";
    }else if(!payload.specialization){
        fieldError = "doctorRegSpecialization";
    }else if(!Number.isFinite(payload.experienceYears) || payload.experienceYears < 0 || payload.experienceYears > 65){
        fieldError = "doctorRegExperience";
    }else if((()=>{
        const d = payload.phone.replace(/\D/g, "");
        return d.length < 8 || d.length > 15;
    })()){
        fieldError = "doctorRegPhone";
    }else if(payload.licenseNumber.length < 4){
        fieldError = "doctorRegLicense";
    }

    if(fieldError){
        highlightField(fieldError);
        toastError("Please complete every field correctly.");
        return;
    }

    try{
        if(submitBtn){
            submitBtn.disabled = true;
        }

        const res = await fetch(BASE + API_REGISTRATION_DOCTOR, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                specialization: payload.specialization,
                experienceYears: payload.experienceYears,
                phone: payload.phone,
                licenseNumber: payload.licenseNumber,
                name: payload.name,
                email: payload.email,
                password: payload.password,
            }),
        });

        const data = await readJsonResponse(res);

        if(data.requiresApproval){
            toastInfo(data.msg || "Awaiting hospital approval.");
            window.location.href = "login-doctor.html";
            return;
        }

        toastSuccess(data.msg || "Registered.");
    }catch(error){
        handleRequestError(error);
    }finally{
        if(submitBtn){
            submitBtn.disabled = false;
        }
    }
}

function highlightField(id){
    const el = document.getElementById(id);

    if(!el){
        return;
    }

    el.classList.add("field-has-error");

    window.setTimeout(()=> el.classList.remove("field-has-error"), 1200);

    el.focus();
}

function clearFormErrorsPatient(){
    ["patientRegName", "patientRegEmail", "patientRegPassword", "patientRegAge", "patientRegGender",
        "patientRegPhone", "patientRegBloodGroup"].forEach((id)=>{
            const node = document.getElementById(id);

            if(node){
                node.classList.remove("field-has-error");
            }
        });
}

function clearFormErrorsDoctor(){
    ["doctorRegName", "doctorRegEmail", "doctorRegPassword", "doctorRegSpecialization", "doctorRegExperience",
        "doctorRegPhone", "doctorRegLicense"].forEach((id)=>{
            const node = document.getElementById(id);

            if(node){
                node.classList.remove("field-has-error");
            }
        });
}

function initAuthRegistrationForms(){
    const patientForm = document.getElementById("patientRegisterForm");

    if(patientForm){
        patientForm.addEventListener("submit", submitPatientRegistration);
    }

    const doctorForm = document.getElementById("doctorRegisterForm");

    if(doctorForm){
        doctorForm.addEventListener("submit", submitDoctorRegistration);
    }
}

/* ================= LOGIN ================= */
async function login(){
    const portal = getAuthPortalFromDom();
    const emailRaw = document.getElementById("email");
    const passwordRaw = document.getElementById("password");
    const email = String(emailRaw ? emailRaw.value : "").trim().toLowerCase();
    const password = String(passwordRaw ? passwordRaw.value : "").trim();

    if(!email || !password){
        toastError("Fill all fields");
        return;
    }

    try{
        const payload = {
            email,
            password,
        };

        const res = await fetch(BASE + "/api/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        const data = await readJsonResponse(res);

        if(!data.token){
            toastError(data.msg || "Login failed");
            return;
        }

        const accountRole = normalizeRole(data.user && data.user.role);

        if(!accountRole){
            toastError("Account role missing. Contact support.");
            return;
        }

        if(portal && accountRole !== portal){
            const hint = {
                patient: "login-patient.html",
                doctor: "login-doctor.html",
                admin: "login-admin.html",
            }[accountRole];
            toastError(`Wrong portal. This account uses the ${accountRole} sign-in page${hint ? ` (${hint})` : ""}.`);
            return;
        }

        setActiveLoginPortal(accountRole);
        setSession(data);

        toastSuccess("Login Successful");
        goToRoleDashboard();
    }catch(error){
        console.warn("[Login] Failed. API base:", BASE, "endpoint: /api/auth/login", "| email:", email, "| pw length:", password.length);
        handleRequestError(error);
    }
}

/* ================= PASSWORD RESET ================= */
function setStatusMessage(elementId, message, type = "info"){
    const element = document.getElementById(elementId);

    if(!element){
        return;
    }

    element.textContent = message;
    element.className = `status-message ${type}`;
}

async function forgotPassword(){
    const email = document.getElementById("forgotEmail").value.trim();
    const button = document.getElementById("forgotPasswordButton");

    if(!email){
        setStatusMessage("forgotPasswordMessage", "Enter your email address.", "error");
        return;
    }

    if(button){
        button.disabled = true;
        button.textContent = "Sending...";
    }

    try{
        const res = await fetch(BASE + "/forgot-password",{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body: JSON.stringify({email})
        });

        const data = await readJsonResponse(res);
        setStatusMessage("forgotPasswordMessage", data.msg, "success");
    }catch(error){
        setStatusMessage("forgotPasswordMessage", error.message || "Unable to send reset link.", "error");
    }finally{
        if(button){
            button.disabled = false;
            button.textContent = "Send Reset Link";
        }
    }
}

async function resetPassword(){
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") || "";
    const password = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    const button = document.getElementById("resetPasswordButton");

    if(!token){
        setStatusMessage("resetPasswordMessage", "Reset token is missing. Please request a new link.", "error");
        return;
    }

    if(password.length < 6){
        setStatusMessage("resetPasswordMessage", "Password must be at least 6 characters.", "error");
        return;
    }

    if(password !== confirmPassword){
        setStatusMessage("resetPasswordMessage", "Passwords do not match.", "error");
        return;
    }

    if(button){
        button.disabled = true;
        button.textContent = "Updating...";
    }

    try{
        const res = await fetch(BASE + "/reset-password",{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body: JSON.stringify({token, password})
        });

        const data = await readJsonResponse(res);
        setStatusMessage("resetPasswordMessage", data.msg, "success");

        setTimeout(()=>{
            window.location.href = "login.html";
        }, 1400);
    }catch(error){
        setStatusMessage("resetPasswordMessage", error.message || "Unable to reset password.", "error");
    }finally{
        if(button){
            button.disabled = false;
            button.textContent = "Update Password";
        }
    }
}

/* ================= ADD PATIENT ================= */
async function addPatient(){
    const name = document.getElementById("pname").value.trim();
    const age = document.getElementById("page").value.trim();
    const disease = document.getElementById("pdisease").value.trim();

    if(!name || !age || !disease || !isValidAge(age)){
        toastError("Fill all fields with a valid age");
        return;
    }

    try{
        const res = await fetch(BASE + "/api/patient/add",{
            method:"POST",
            headers:authHeaders({"Content-Type":"application/json"}),
            body: JSON.stringify({name, age, disease})
        });

        const data = await readJsonResponse(res);
        toastSuccess(data.msg);

        document.getElementById("pname").value = "";
        document.getElementById("page").value = "";
        document.getElementById("pdisease").value = "";

        refreshDashboard();
    }catch(error){
        handleRequestError(error);
    }
}

/* ================= DELETE ================= */
async function deletePatient(id){
    try{
        const res = await fetch(BASE + "/api/patient/delete/" + encodeURIComponent(id),{
            method:"DELETE",
            headers:authHeaders()
        });

        const data = await readJsonResponse(res);
        toastSuccess(data.msg);

        refreshDashboard();
    }catch(error){
        handleRequestError(error);
    }
}

/* ================= EDIT ================= */
async function editPatient(){
    toastInfo("Detailed record editing is available from the clinician records module.");
}

async function fetchPatients(){
    const res = await fetch(BASE + "/api/patient/all",{
        headers:authHeaders()
    });

    const data = await readJsonResponse(res);

    if(!Array.isArray(data)){
        throw new Error(data.msg || "Invalid patient data");
    }

    return data;
}

function renderPatients(patients){
    const list = document.getElementById("list");

    if(!list){
        return;
    }

    list.replaceChildren();

    if(patients.length === 0){
        const empty = document.createElement("p");
        empty.textContent = "No patients added yet.";
        list.appendChild(empty);
        return;
    }

    patients.forEach((patient)=>{
        const card = document.createElement("div");
        card.className = "patient-row";

        const details = document.createElement("p");
        appendDetail(details, "Name", patient.name || "N/A");
        appendDetail(details, "Age", String(patient.age ?? "N/A"));
        appendDetail(details, "Disease", patient.disease || "N/A");

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.textContent = "Edit";
        editButton.addEventListener("click", ()=>{
            editPatient(patient._id, patient.name || "", String(patient.age ?? ""), patient.disease || "");
        });

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.textContent = "Delete";
        deleteButton.addEventListener("click", ()=>{
            deletePatient(patient._id);
        });

        card.appendChild(details);
        card.appendChild(editButton);
        card.appendChild(deleteButton);
        list.appendChild(card);
    });
}

function appendDetail(parent, label, value){
    const strong = document.createElement("strong");
    strong.textContent = `${label}:`;

    parent.appendChild(strong);
    parent.appendChild(document.createTextNode(` ${value}`));

    if(label !== "Disease"){
        parent.appendChild(document.createElement("br"));
    }
}

/* ================= LOAD PATIENT ================= */
async function loadPatients(){
    try{
        const patients = await fetchPatients();
        renderPatients(patients);
        return patients;
    }catch(error){
        handleRequestError(error);
        return [];
    }
}

async function refreshDashboard(){
    try{
        const patients = await fetchPatients();
        latestPatients = patients;
        renderPatients(patients);
        renderChart(patients);

        const statTotal = document.getElementById("statTotalPatients");
        if(statTotal){
            statTotal.textContent = String(patients.length);
        }

        const statHighRisk = document.getElementById("statHighRisk");
        if(statHighRisk){
            statHighRisk.textContent = String(patients.filter((p)=>Number(p.age) >= 60).length);
        }
    }catch(error){
        handleRequestError(error);
    }
}

/* ================= AI ================= */
async function predict(){
    const ageInput = document.getElementById("riskAge");
    const symptomsInput = document.getElementById("riskSymptoms");
    const historyInput = document.getElementById("riskHistory");
    const predictButton = document.getElementById("predictButton");
    const predictionLoader = document.getElementById("predictionLoader");

    if(!ageInput){
        toastError("Enter your age in the field below to run the prediction.");
        return;
    }

    const age = ageInput.value.trim();

    if(!age || !isValidAge(age) || Number(age) > 130){
        toastError("Enter a valid age");
        return;
    }

    setPredictionLoading(true, predictButton, predictionLoader);
    clearPredictionResult();

    try{
        const res = await fetch(BASE + "/predict", {
            method:"POST",
            headers:authHeaders({"Content-Type":"application/json"}),
            body: JSON.stringify({
                age: Number(age),
                symptoms: splitClinicalList(symptomsInput ? symptomsInput.value : ""),
                history: splitClinicalList(historyInput ? historyInput.value : "")
            })
        });
        const data = await readJsonResponse(res);
        renderPredictionResult(data);
    }catch(error){
        handleRequestError(error);
    }finally{
        setPredictionLoading(false, predictButton, predictionLoader);
    }
}

function splitClinicalList(value){
    return value
        .split(/[,;\n]/)
        .map((item)=>item.trim())
        .filter(Boolean);
}

function setPredictionLoading(isLoading, button, loader){
    if(button){
        button.disabled = isLoading;
        button.textContent = isLoading ? "Analyzing..." : "Run AI";
    }

    if(loader){
        loader.hidden = !isLoading;
    }
}

function clearPredictionResult(){
    const result = document.getElementById("predictionResult");

    if(result){
        result.hidden = true;
        result.replaceChildren();
        result.className = "prediction-result";
    }
}

function renderPredictionResult(data){
    const result = document.getElementById("predictionResult");

    if(!result){
        toastInfo(`${data.prediction} (${data.confidence}% confidence)`);
        return;
    }

    const riskLevel = String(data.riskLevel || "low").toLowerCase();
    result.hidden = false;
    result.className = `prediction-result ${riskLevel}`;
    result.replaceChildren();

    const header = document.createElement("div");
    header.className = "prediction-result-header";

    const badge = document.createElement("span");
    badge.className = `risk-badge ${riskLevel}`;
    badge.textContent = `${riskLevel.toUpperCase()} RISK`;

    const confidence = document.createElement("span");
    confidence.className = "confidence-score";
    confidence.textContent = `${data.confidence}% confidence`;

    header.appendChild(badge);
    header.appendChild(confidence);

    const title = document.createElement("h4");
    title.textContent = data.prediction || "Prediction";

    const explanation = document.createElement("p");
    explanation.textContent = data.explanation || "No explanation returned.";

    const factorTitle = document.createElement("strong");
    factorTitle.textContent = "Key factors";

    const factors = document.createElement("ul");
    (data.factors || []).forEach((factor)=>{
        const item = document.createElement("li");
        item.textContent = `${factor.label} (${factor.impact} impact)`;
        factors.appendChild(item);
    });

    const suggestionTitle = document.createElement("strong");
    suggestionTitle.textContent = "Suggestions";

    const suggestions = document.createElement("ul");
    (data.suggestions || []).forEach((suggestion)=>{
        const item = document.createElement("li");
        item.textContent = suggestion;
        suggestions.appendChild(item);
    });

    result.appendChild(header);
    result.appendChild(title);
    result.appendChild(explanation);

    if((data.factors || []).length > 0){
        result.appendChild(factorTitle);
        result.appendChild(factors);
    }

    if((data.suggestions || []).length > 0){
        result.appendChild(suggestionTitle);
        result.appendChild(suggestions);
    }
}

/* ================= LOGOUT ================= */
function logout(showAlert = true){
    localStorage.removeItem("token");
    localStorage.removeItem("userRole");
    localStorage.removeItem("userName");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userId");

    if(showAlert){
        toastSuccess("Logged out");
    }

    window.location.href = getLoginRedirectPage();
}

/* ================= CHART ================= */
async function loadChart(patients){
    try{
        const data = patients || await fetchPatients();
        renderChart(data);
    }catch(error){
        handleRequestError(error);
    }
}

function renderChart(patients){
    const chartCanvas = document.getElementById("chart");

    if(!chartCanvas || typeof Chart === "undefined"){
        return;
    }

    latestPatients = patients;

    let young = 0;
    let adult = 0;
    let old = 0;

    patients.forEach((patient)=>{
        const age = Number(patient.age);

        if(age < 30) young++;
        else if(age < 50) adult++;
        else old++;
    });

    const ctx = chartCanvas.getContext("2d");
    const textColor = getCssVar("--text");
    const mutedColor = getCssVar("--muted");
    const gridColor = getCssVar("--chart-grid");
    const primaryColor = getCssVar("--primary");
    const secondaryColor = getCssVar("--secondary");
    const primarySoftColor = getCssVar("--primary-soft");

    if(chartInstance){
        chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
        type: "bar",
        data: {
            labels: ["Young", "Adult", "Old"],
            datasets: [{
                label: "Patients",
                data: [young, adult, old],
                backgroundColor: [
                    primaryColor,
                    secondaryColor,
                    primarySoftColor
                ],
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    labels: {
                        color: textColor
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: mutedColor },
                    grid: { color: gridColor }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: mutedColor, precision: 0 },
                    grid: { color: gridColor }
                }
            }
        }
    });
}

document.addEventListener("DOMContentLoaded", initTheme);
document.addEventListener("DOMContentLoaded", syncLoginPortalPreferenceFromDom);
document.addEventListener("DOMContentLoaded", initAdminDirectoryDelegation);
document.addEventListener("DOMContentLoaded", initAdminUserDirectoryToolbar);
document.addEventListener("DOMContentLoaded", initAdminDeleteUserModal);
document.addEventListener("DOMContentLoaded", initAuthRegistrationForms);

document.addEventListener("DOMContentLoaded", ()=>{
    const page = (window.location.pathname.split("/").pop() || "");

    if(!["patient-dashboard.html", "doctor-dashboard.html", "admin-dashboard.html"].includes(page)){
        initDashboardShell();
    }
});

document.addEventListener("DOMContentLoaded", initMockDashboards);
document.addEventListener("DOMContentLoaded", initDoctorSearchFilter);
document.addEventListener("DOMContentLoaded", initPatientDoctorBookDelegation);
document.addEventListener("DOMContentLoaded", initDoctorModalBackdrop);
window.addEventListener("load", hideLoader);

let adminDirectoryUsersFull = [];
let adminDirectorySearchTimer = null;
let adminDeletePendingId = null;

function normalizeAdminDirectorySearch(raw){
    return String(raw || "").trim().toLowerCase();
}

function userMatchesAdminDirectoryQuery(u, q){
    if(!q){
        return true;
    }

    const name = (u.name || "").toLowerCase();
    const email = (u.email || "").toLowerCase();
    const role = String(u.role || "").toLowerCase();

    return name.includes(q) || email.includes(q) || role.includes(q);
}

function getAdminFilteredUsers(){
    const input = document.getElementById("adminUserSearchInput");
    const roleSel = document.getElementById("adminUserRoleFilter");
    const q = normalizeAdminDirectorySearch(input ? input.value : "");
    const rolePick = roleSel ? roleSel.value : "all";

    let list = adminDirectoryUsersFull.slice();

    if(rolePick !== "all"){
        list = list.filter((u)=> normalizeRole(u.role) === rolePick);
    }

    if(!q){
        return list;
    }

    return list.filter((u)=> userMatchesAdminDirectoryQuery(u, q));
}

function scheduleAdminDirectoryFilterRedraw(){
    window.clearTimeout(adminDirectorySearchTimer);
    adminDirectorySearchTimer = window.setTimeout(()=>{
        renderAdminUsersTable(getAdminFilteredUsers());
    }, 220);
}

function redrawAdminUsersTableImmediate(){
    window.clearTimeout(adminDirectorySearchTimer);
    renderAdminUsersTable(getAdminFilteredUsers());
}

function initAdminUserDirectoryToolbar(){
    const searchInput = document.getElementById("adminUserSearchInput");
    const clearBtn = document.getElementById("adminUserSearchClear");
    const roleSel = document.getElementById("adminUserRoleFilter");

    if(!searchInput && !roleSel){
        return;
    }

    if(searchInput && !searchInput.dataset.adminToolbarBound){
        searchInput.dataset.adminToolbarBound = "1";
        searchInput.addEventListener("input", scheduleAdminDirectoryFilterRedraw);
        searchInput.addEventListener("search", redrawAdminUsersTableImmediate);
    }

    if(clearBtn && searchInput && !clearBtn.dataset.adminToolbarBound){
        clearBtn.dataset.adminToolbarBound = "1";
        clearBtn.addEventListener("click", ()=>{
            searchInput.value = "";
            redrawAdminUsersTableImmediate();
            searchInput.focus();
        });
    }

    if(roleSel && !roleSel.dataset.adminToolbarBound){
        roleSel.dataset.adminToolbarBound = "1";
        roleSel.addEventListener("change", redrawAdminUsersTableImmediate);
    }
}

function openAdminDeleteUserModal(userId){
    adminDeletePendingId = userId == null ? null : String(userId).trim();
    const modal = document.getElementById("adminDeleteUserModal");

    if(modal){
        modal.style.display = "flex";
        modal.querySelector("[data-admin-delete-cancel]")?.focus();
    }
}

function closeAdminDeleteUserModal(){
    adminDeletePendingId = null;
    const modal = document.getElementById("adminDeleteUserModal");

    if(modal){
        modal.style.display = "none";
    }
}

async function confirmAdminDeleteUser(event){
    if(event){
        event.preventDefault();
        event.stopPropagation();
    }

    const userId = adminDeletePendingId == null ? "" : String(adminDeletePendingId).trim();
    const modal = document.getElementById("adminDeleteUserModal");
    const confirmBtn = modal?.querySelector("[data-admin-delete-confirm]");

    if(!userId || !isHexObjectId24(userId)){
        toastError(userId ? "Invalid user id" : "Failed to delete user");
        closeAdminDeleteUserModal();
        return;
    }

    if(confirmBtn){
        confirmBtn.disabled = true;
    }

    try{
        const res = await fetch(`${BASE.replace(/\/$/, "")}/api/admin/users/${encodeURIComponent(userId)}`, {
            method: "DELETE",
            headers: {
                ...authHeaders(),
                "Accept": "application/json",
            },
        });
        const data = await res.json().catch(() => ({}));

        if(!res.ok){
            const msg = data.msg || data.message || `Delete failed (${res.status})`;
            toastError(msg);

            if(res.status === 401){
                logout(false);
            }

            return;
        }

        if(data.success !== true){
            toastError(data.msg || data.message || "Failed to delete user");
            return;
        }

        toastSuccess("User deleted successfully");
        adminDirectoryUsersFull = adminDirectoryUsersFull.filter((u)=> String(u.id) !== String(userId));
        closeAdminDeleteUserModal();
        redrawAdminUsersTableImmediate();
        updateAdminStats(adminDirectoryUsersFull);
    }catch(_err){
        toastError("Failed to delete user");
    }finally{
        if(confirmBtn){
            confirmBtn.disabled = false;
        }
    }
}

function isHexObjectId24(id){
    return /^[a-f\d]{24}$/i.test(String(id || ""));
}

function initAdminDeleteUserModal(){
    const modal = document.getElementById("adminDeleteUserModal");

    if(!modal || modal.dataset.bound === "1"){
        return;
    }

    modal.dataset.bound = "1";
    modal.addEventListener("click", (event)=>{
        if(event.target === modal){
            closeAdminDeleteUserModal();
        }
    });
    modal.querySelector("[data-admin-delete-cancel]")?.addEventListener("click", closeAdminDeleteUserModal);
    modal.querySelector("[data-admin-delete-confirm]")?.addEventListener("click", confirmAdminDeleteUser);
}

function initDoctorSearchFilter(){
    const filter = document.getElementById("doctorSearchFilter");
    if(!filter){
        return;
    }

    filter.addEventListener("input", ()=>{
        const q = filter.value.trim().toLowerCase();
        ["doctorAppointmentsList", "doctorApprovedList"].forEach((id)=>{
            const root = document.getElementById(id);
            if(!root){
                return;
            }

            root.querySelectorAll(".list-item").forEach((row)=>{
                const text = row.textContent.toLowerCase();
                row.style.display = !q || text.includes(q) ? "" : "none";
            });
        });
    });
}

function initDoctorModalBackdrop(){
    const modal = document.getElementById("doctorPatientModal");
    if(!modal){
        return;
    }

    modal.addEventListener("click", (event)=>{
        if(event.target === modal){
            closeDoctorModal();
        }
    });
}

function initPatientDoctorBookDelegation(){
    const wrap = document.getElementById("patientAvailableDoctors");
    if(!wrap){
        return;
    }

    wrap.addEventListener("click", (event)=>{
        const button = event.target.closest("[data-book-doctor]");
        if(!button){
            return;
        }

        const doctorId = button.getAttribute("data-book-doctor");
        if(doctorId){
            prefillDoctor(doctorId);
        }
    });
}

function initMockDashboards(){
}

function adminLifecyclePill(user){
    if(user.isBlocked){
        return `<span class="pill danger"><span class="dot"></span>BLOCKED</span>`;
    }

    if(user.role === "doctor" && !user.isApproved){
        return `<span class="pill warning"><span class="dot"></span>PENDING</span>`;
    }

    return `<span class="pill success"><span class="dot"></span>ACTIVE</span>`;
}

function adminActionButtons(user){
    const selfId = localStorage.getItem("userId");
    const isSelf = selfId && String(user.id) === String(selfId);

    if(user.role === "admin"){
        if(isSelf){
            return `<span class="admin-action-muted">You</span>`;
        }

        return `<span class="admin-action-muted">Protected</span>`;
    }

    if(isSelf){
        return `<span class="admin-action-muted">You</span>`;
    }

    const parts = [];

    if(user.role === "doctor" && !user.isApproved){
        parts.push(`<button type="button" class="btn-soft" data-admin-action="approve" data-user-id="${escapeHtml(user.id)}">Approve</button>`);
    }

    if(user.isBlocked){
        parts.push(`<button type="button" class="btn-soft" data-admin-action="unblock" data-user-id="${escapeHtml(user.id)}">Unblock</button>`);
    }else{
        parts.push(`<button type="button" class="btn-soft" data-admin-action="block" data-user-id="${escapeHtml(user.id)}">Block</button>`);
    }

    parts.push(`<button type="button" class="btn-soft btn-admin-delete" data-admin-action="delete" data-user-id="${escapeHtml(user.id)}">Delete</button>`);

    return `<div class="admin-action-row">${parts.join("")}</div>`;
}

function adminProfileLine(u){
    if(!u){
        return "";
    }

    if(u.role === "doctor"){
        const lic = u.licenseNumber ? ` · LIC ${escapeHtml(u.licenseNumber)}` : "";

        return `<div style="color:var(--muted);font-size:0.8rem;margin-top:4px;font-weight:700;">${escapeHtml(u.specialization || "—")}${lic}${u.phone ? ` · ☎ ${escapeHtml(u.phone)}` : ""}</div>`;
    }

    if(u.role === "patient"){
        const bits = [
            u.patientAge != null ? `Age ${u.patientAge}` : "",
            u.gender || "",
            u.bloodGroup || "",
        ].filter(Boolean).join(" · ");

        const phone = u.phone ? ` ☎ ${escapeHtml(u.phone)}` : "";

        return `<div style="color:var(--muted);font-size:0.8rem;margin-top:4px;font-weight:700;">${escapeHtml(bits || "Patient profile")}${phone}</div>`;
    }

    return u.phone ? `<div style="color:var(--muted);font-size:0.8rem;margin-top:4px;font-weight:700;">☎ ${escapeHtml(u.phone)}</div>` : "";
}

function renderAdminUsersTable(users){
    const mount = document.getElementById("adminUsersTable");

    if(!mount){
        return;
    }

    if(adminDirectoryUsersFull.length === 0){
        mount.innerHTML = `<p class="admin-empty-message">No accounts in the directory.</p>`;
        return;
    }

    if(users.length === 0){
        mount.innerHTML = `<p class="admin-empty-message">No users found</p>`;
        return;
    }

    mount.innerHTML = `
        <div class="table-scroll admin-users-scroll">
            <table class="table admin-directory-table" aria-label="Directory of HealthSys accounts">
                <thead>
                    <tr>
                        <th>Identity</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map((u)=>`
                        <tr class="admin-user-row">
                            <td data-label="Identity">
                                <strong class="admin-user-name">${escapeHtml(u.name || "—")}</strong><br>
                                <span class="admin-user-email">${escapeHtml(u.email || "")}</span>
                                ${adminProfileLine(u)}
                            </td>
                            <td data-label="Role"><span class="pill primary admin-role-chip"><span class="dot"></span>${escapeHtml(String(u.role || "").toUpperCase())}</span></td>
                            <td data-label="Status">${adminLifecyclePill(u)}</td>
                            <td class="actions" data-label="Actions">${adminActionButtons(u)}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
        <p class="admin-directory-footnote">Approve pending doctors before they can sign in. Block revokes access; delete permanently removes patients or doctors.</p>
    `;
}

function updateAdminStats(users){
    const total = users.length;
    const doctors = users.filter((u)=> u.role === "doctor").length;
    const patients = users.filter((u)=> u.role === "patient").length;
    const pending = users.filter((u)=> u.role === "doctor" && !u.isApproved).length;

    const map = [
        ["adminStatTotal", String(total)],
        ["adminStatDoctors", String(doctors)],
        ["adminStatPatients", String(patients)],
        ["adminStatPending", String(pending)],
    ];

    map.forEach(([id, val])=>{
        const el = document.getElementById(id);

        if(el){
            el.textContent = val;
        }
    });
}

async function loadAdminDashboard(){
    const mount = document.getElementById("adminUsersTable");

    if(!mount){
        return;
    }

    mount.innerHTML = `<p style="color:var(--muted);font-weight:800;">Loading directory…</p>`;

    try{
        const res = await fetch(`${BASE}/api/admin/users`, { headers: authHeaders() });
        const data = await readJsonResponse(res);
        const users = Array.isArray(data.users) ? data.users : [];

        adminDirectoryUsersFull = users;
        initAdminUserDirectoryToolbar();
        renderAdminUsersTable(getAdminFilteredUsers());
        updateAdminStats(adminDirectoryUsersFull);
    }catch(error){
        adminDirectoryUsersFull = [];
        mount.innerHTML = `<p style="color:var(--danger);font-weight:800;">Could not refresh admin directory.</p>`;
        handleRequestError(error);
    }
}

async function handleAdminDirectoryClick(event){
    const button = event.target.closest("[data-admin-action]");

    if(!button || button.disabled){
        return;
    }

    const action = button.getAttribute("data-admin-action");
    const userId = button.getAttribute("data-user-id");

    if(!action || !userId){
        return;
    }

    if(action === "delete"){
        openAdminDeleteUserModal(userId);
        return;
    }

    let payload = {};

    if(action === "approve"){
        payload = { isApproved: true };
    }else if(action === "block"){
        payload = { isBlocked: true };
    }else if(action === "unblock"){
        payload = { isBlocked: false };
    }else{
        return;
    }

    button.disabled = true;

    try{
        const res = await fetch(`${BASE}/api/admin/users/${encodeURIComponent(userId)}`, {
            method: "PATCH",
            headers: {
                ...authHeaders(),
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });
        await readJsonResponse(res);
        toastSuccess("Account updated");
        await loadAdminDashboard();
    }catch(error){
        handleRequestError(error);
        button.disabled = false;
    }
}

function initAdminDirectoryDelegation(){
    const root = document.getElementById("adminDirectoryRoot");

    if(!root || root.dataset.adminDelegation === "1"){
        return;
    }

    root.dataset.adminDelegation = "1";
    root.addEventListener("click", handleAdminDirectoryClick);
}

function escapeHtml(value){
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#039;");
}

function appointmentStatusMarkup(status){
    const normalized = String(status || "").toLowerCase();
    if(normalized === "approved"){
        return `<span class="pill success"><span class="dot"></span>APPROVED</span>`;
    }
    if(normalized === "completed"){
        return `<span class="pill primary"><span class="dot"></span>COMPLETED</span>`;
    }
    if(normalized === "cancelled"){
        return `<span class="pill danger"><span class="dot"></span>CANCELLED</span>`;
    }
    return `<span class="pill warning"><span class="dot"></span>PENDING</span>`;
}

function formatGender(value){
    const map = {
        male: "Male",
        female: "Female",
        other: "Other",
        prefer_not: "Not specified",
    };
    const key = String(value || "").toLowerCase();
    return map[key] || "Not specified";
}

/* ================= APPOINTMENTS (REAL) ================= */
async function loadPatientDashboard(){
    await Promise.all([
        loadDoctorsIntoPatientUI(),
        loadMyAppointmentsIntoPatientUI(),
    ]);
}

async function loadDoctorsIntoPatientUI(){
    const select = document.getElementById("bookDoctor");
    const list = document.getElementById("patientAvailableDoctors");

    if(!select && !list){
        return;
    }

    try{
        const res = await fetch(BASE + "/api/appointments/doctors", {
            headers: authHeaders(),
        });
        const data = await readJsonResponse(res);
        const doctors = Array.isArray(data.doctors) ? data.doctors : [];

        if(select){
            select.replaceChildren();
            const placeholder = document.createElement("option");
            placeholder.value = "";
            placeholder.textContent = doctors.length ? "Select a doctor" : "No doctors available";
            select.appendChild(placeholder);

            doctors.forEach((d)=>{
                const opt = document.createElement("option");
                opt.value = d.id;
                opt.textContent = doctorDisplayLabel(d.name);
                select.appendChild(opt);
            });
        }

        if(list){
            if(doctors.length === 0){
                list.innerHTML = `<p style="color:var(--muted);font-weight:800;">No approved doctors yet. Ask admin to approve doctor accounts.</p>`;
                return;
            }

            list.innerHTML = `
                <div class="list" aria-label="Available doctors list">
                    ${doctors.slice(0, 12).map((d)=>`
                        <div class="list-item">
                            <div style="display:flex;gap:12px;align-items:center;">
                                <div class="avatar" aria-hidden="true" style="width:40px;height:40px;"></div>
                                <div>
                                    <strong>${escapeHtml(doctorDisplayLabel(d.name))}</strong>
                                    <small>${escapeHtml(d.email || "")}</small>
                                </div>
                            </div>
                            <button class="btn-soft" type="button" data-book-doctor="${escapeHtml(d.id)}">Book</button>
                        </div>
                    `).join("")}
                </div>
            `;
        }
    }catch(error){
        handleRequestError(error);
        if(list){
            list.innerHTML = `<p style="color:var(--muted);font-weight:800;">Could not load doctors. Check login and try again.</p>`;
        }
    }
}

function prefillDoctor(doctorId){
    const select = document.getElementById("bookDoctor");
    if(select){
        select.value = doctorId;
        toastInfo("Doctor selected. Choose a time and submit.");
        const when = document.getElementById("bookWhen");
        if(when){
            when.focus();
        }
    }
}

async function loadMyAppointmentsIntoPatientUI(){
    const mount = document.getElementById("patientNextAppointment");
    const listMount = document.getElementById("patientAppointmentsList");
    try{
        const res = await fetch(BASE + "/api/appointments/me", { headers: authHeaders() });
        const data = await readJsonResponse(res);
        const appointments = Array.isArray(data.appointments) ? data.appointments : [];
        const active = appointments.filter((a)=> a.status !== "cancelled");
        const upcoming = appointments
            .filter((a)=> a.status === "pending" || a.status === "approved")
            .sort((a,b)=> new Date(a.scheduledAt) - new Date(b.scheduledAt));

        const pendingCount = appointments.filter((a)=> a.status === "pending").length;
        const approvedCount = appointments.filter((a)=> a.status === "approved").length;
        const now = Date.now();

        const setPatientStat = (id, val)=>{
            const target = document.getElementById(id);
            if(target){
                target.textContent = String(val);
            }
        };

        setPatientStat("patientStatPending", pendingCount);
        setPatientStat("patientStatApproved", approvedCount);
        setPatientStat("patientStatUpcoming", upcoming.length);
        setPatientStat("patientStatOpen", active.length);

        if(mount){
            if(upcoming.length === 0){
                mount.innerHTML = `<p style="color:var(--muted);font-weight:800;">No upcoming visits yet. Submit a booking request below.</p>`;
            }else{
                const next = upcoming[0];
                const display = new Date(next.scheduledAt).toLocaleString();

                mount.innerHTML = `
                    <div class="list">
                        <div class="list-item">
                            <div>
                                <strong>${escapeHtml(doctorDisplayLabel(next.doctor?.name))}</strong>
                                <small>${escapeHtml(display)} • ${escapeHtml(next.reason)} • Phone ${escapeHtml(next.phone || "—")}</small>
                            </div>
                            ${appointmentStatusMarkup(next.status)}
                        </div>
                    </div>
                    <p style="color:var(--muted);margin-top:12px;font-weight:800;">When the clinician accepts your request it changes to Approved.</p>
                `;
            }
        }

        if(listMount){
            if(active.length === 0){
                listMount.innerHTML = `<p style="color:var(--muted);font-weight:800;">You have no bookings yet.</p>`;
                return;
            }

            listMount.innerHTML = `
                <div class="list" aria-label="My appointments">
                    ${active
                        .sort((a,b)=> new Date(b.scheduledAt) - new Date(a.scheduledAt))
                        .map((a)=>{
                            const isPast = new Date(a.scheduledAt).getTime() < now;
                            return `
                                <div class="list-item">
                                    <div>
                                        <strong>${escapeHtml(doctorDisplayLabel(a.doctor?.name))}</strong>
                                        <small style="white-space:pre-wrap;display:block;line-height:1.5;color:var(--muted);font-weight:800;margin-top:4px;">
${escapeHtml(new Date(a.scheduledAt).toLocaleString())}
Visit reason: ${escapeHtml(a.reason)}
Symptoms: ${escapeHtml(a.symptoms || "—")}
Age / gender / phone: ${a.patientAge != null ? escapeHtml(String(a.patientAge)) : "—"} • ${escapeHtml(formatGender(a.gender))} • ${escapeHtml(a.phone || "—")}
${isPast ? "Past appointment" : "Upcoming appointment"}
                                        </small>
                                    </div>
                                    ${appointmentStatusMarkup(a.status)}
                                </div>
                            `;
                        }).join("")}
                </div>
            `;
        }
    }catch(error){
        handleRequestError(error);
        ["patientStatPending", "patientStatApproved", "patientStatUpcoming", "patientStatOpen"].forEach((statId)=>{
            const statEl = document.getElementById(statId);
            if(statEl){
                statEl.textContent = "0";
            }
        });
        const empty = `<p style="color:var(--muted);font-weight:800;">Could not load appointments.</p>`;
        if(mount){
            mount.innerHTML = empty;
        }
        if(listMount){
            listMount.innerHTML = empty;
        }
    }
}

async function bookAppointment(){
    const doctorId = (document.getElementById("bookDoctor") || {}).value || "";
    const when = (document.getElementById("bookWhen") || {}).value || "";
    const reason = (document.getElementById("bookReason") || {}).value || "";
    const symptoms = (document.getElementById("bookSymptoms") || {}).value || "";
    const phone = ((document.getElementById("bookPhone") || {}).value || "").trim();
    const ageRaw = (document.getElementById("bookAge") || {}).value || "";
    const gender = ((document.getElementById("bookGender") || {}).value || "").trim();
    const btn = document.getElementById("bookButton");

    if(!doctorId){
        toastError("Please select a doctor");
        return;
    }

    if(!when){
        toastError("Please choose a date and time");
        return;
    }

    if(!String(reason).trim()){
        toastError("Please enter the reason for the visit");
        return;
    }

    if(!phone || phone.replace(/\D+/g, "").length < 8){
        toastError("Please enter a valid phone number (at least 8 digits)");
        return;
    }

    if(!isValidAge(ageRaw.trim())){
        toastError("Enter a valid age between 0 and 130");
        return;
    }

    if(!gender){
        toastError("Please choose your gender");
        return;
    }

    if(btn){
        btn.disabled = true;
        btn.textContent = "Submitting…";
    }

    try{
        const res = await fetch(BASE + "/api/appointments", {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
                doctorId,
                scheduledAt: new Date(when).toISOString(),
                reason: String(reason).trim(),
                symptoms: String(symptoms || "").trim(),
                phone,
                patientAge: Number(ageRaw.trim()),
                gender,
            }),
        });

        const data = await readJsonResponse(res);
        toastSuccess(data.msg || "Appointment requested");

        const reasonEl = document.getElementById("bookReason");
        const symptomsEl = document.getElementById("bookSymptoms");
        const phoneEl = document.getElementById("bookPhone");
        const ageEl = document.getElementById("bookAge");
        const genderEl = document.getElementById("bookGender");
        if(reasonEl) reasonEl.value = "";
        if(symptomsEl) symptomsEl.value = "";
        if(phoneEl) phoneEl.value = "";
        if(ageEl) ageEl.value = "";
        if(genderEl) genderEl.value = "";

        await loadMyAppointmentsIntoPatientUI();
    }catch(error){
        handleRequestError(error);
    }finally{
        if(btn){
            btn.disabled = false;
            btn.textContent = "Submit request";
        }
    }
}

let selectedDoctorAppointmentId = "";

async function loadDoctorDashboard(){
    try{
        const res = await fetch(BASE + "/api/appointments/doctor", {
            headers: authHeaders(),
        });
        const data = await readJsonResponse(res);
        const appointments = Array.isArray(data.appointments) ? data.appointments : [];
        hydrateDoctorOperationalViews(appointments);
    }catch(error){
        handleRequestError(error);
        hydrateDoctorOperationalViews([]);
    }
}

function hydrateDoctorOperationalViews(appointments){
    renderDoctorInboundList(appointments);
    renderDoctorApprovedList(appointments);
    updateDoctorOperationalStats(appointments);
    renderDoctorGrowthTrend(appointments);
}

function renderDoctorInboundList(appointments){
    const mount = document.getElementById("doctorAppointmentsList");
    if(!mount){
        return;
    }

    const pending = appointments.filter((a)=> a.status === "pending")
        .sort((a,b)=> new Date(a.scheduledAt) - new Date(b.scheduledAt));

    if(pending.length === 0){
        mount.innerHTML = `<p style="color:var(--muted);font-weight:800;">No pending appointment requests right now.</p>`;
        return;
    }

    mount.innerHTML = `
        <div class="list">
            ${pending.map((a)=>`
                <div class="list-item">
                    <div>
                        <strong>${escapeHtml(a.patient?.name || "Patient")}</strong>
                        <small style="white-space:pre-wrap;display:block;line-height:1.5;color:var(--muted);font-weight:800;margin-top:4px;">
${escapeHtml(new Date(a.scheduledAt).toLocaleString())}
Chief complaint: ${escapeHtml(a.reason)}
Symptoms: ${escapeHtml(a.symptoms || "—")}
Patient: age ${escapeHtml(String(a.patientAge ?? "—"))} • ${escapeHtml(formatGender(a.gender))} • Phone ${escapeHtml(a.phone || "—")}
Email: ${escapeHtml(a.patient?.email || "—")}
                        </small>
                    </div>
                    <div style="display:grid;gap:10px;justify-items:end;text-align:right;">
                        ${appointmentStatusMarkup(a.status)}
                        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;">
                            <button class="btn-soft" type="button" onclick="openDoctorModal('${escapeHtml(a.id)}')">View profile</button>
                            <button class="btn-soft" type="button" onclick="approveAppointmentById('${escapeHtml(a.id)}')">Accept</button>
                        </div>
                    </div>
                </div>
            `).join("")}
        </div>
    `;
}

function renderDoctorApprovedList(appointments){
    const mount = document.getElementById("doctorApprovedList");
    if(!mount){
        return;
    }

    const approved = appointments.filter((a)=> a.status === "approved")
        .sort((a,b)=> new Date(a.scheduledAt) - new Date(b.scheduledAt));

    if(approved.length === 0){
        mount.innerHTML = `<p style="color:var(--muted);font-weight:800;">Accepted visits will appear here with full patient-entered detail.</p>`;
        return;
    }

    mount.innerHTML = `
        <div class="list">
            ${approved.map((a)=>`
                <div class="list-item">
                    <div>
                        <strong>${escapeHtml(a.patient?.name || "Patient")}</strong>
                        <small>${escapeHtml(new Date(a.scheduledAt).toLocaleString())}</small>
                        <small style="display:block;color:var(--muted);margin-top:4px;line-height:1.5;font-weight:800;">
                            ${escapeHtml(a.reason)}
                        </small>
                    </div>
                    ${appointmentStatusMarkup(a.status)}
                </div>
            `).join("")}
        </div>
    `;
}

function updateDoctorOperationalStats(appointments){
    const pending = appointments.filter((a)=> a.status === "pending").length;
    const approved = appointments.filter((a)=> a.status === "approved").length;
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const thisMonthCount = appointments.filter((a)=>{
        const d = new Date(a.scheduledAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return key === ym && a.status !== "cancelled";
    }).length;

    const uniquePatients = new Set(
        appointments
            .filter((a)=> a.status !== "cancelled")
            .map((a)=> String(a.patientId || "").trim())
            .filter(Boolean),
    );

    const setStatIfPresent = (id, value)=>{
        const stat = document.getElementById(id);
        if(stat){
            stat.textContent = String(value);
        }
    };

    setStatIfPresent("doctorStatPending", pending);
    setStatIfPresent("doctorStatApproved", approved);
    setStatIfPresent("doctorStatMonthly", thisMonthCount);
    setStatIfPresent("doctorStatPatients", uniquePatients.size);
}

function renderDoctorGrowthTrend(appointments){
    const canvas = document.getElementById("doctorGrowthChart");

    if(!canvas){
        return;
    }

    if(typeof Chart === "undefined"){
        return;
    }

    const bucket = {};

    appointments
        .filter((a)=> a.status !== "cancelled")
        .forEach((a)=>{
            const d = new Date(a.scheduledAt);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            bucket[key] = (bucket[key] || 0) + 1;
        });

    const keys = Object.keys(bucket).sort();
    const recentKeys = keys.length ? keys.slice(-6) : [];
    let labels = recentKeys.map((key)=>{
        const parts = key.split("-");
        const date = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
        return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
    });

    let values = recentKeys.map((key)=> bucket[key]);

    if(!labels.length){
        labels = ["No data yet"];
        values = [0];
    }

    const primary = getCssVar("--primary") || "#4f8cff";

    const ctx = canvas.getContext("2d");

    if(doctorGrowthChartInst){
        doctorGrowthChartInst.destroy();
    }

    doctorGrowthChartInst = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels.length ? labels : ["No bookings yet"],
            datasets: [{
                label: "Visits scheduled",
                data: values.length ? values : [0],
                borderRadius: 12,
                backgroundColor: primary,
            }],
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
            },
            scales: {
                x: {
                    ticks: { color: getCssVar("--muted") },
                    grid: { color: getCssVar("--chart-grid") },
                },
                y: {
                    beginAtZero: true,
                    precision: 0,
                    ticks: { color: getCssVar("--muted") },
                    grid: { color: getCssVar("--chart-grid") },
                },
            },
        },
    });
}

async function openDoctorModal(appointmentId){
    try{
        const res = await fetch(BASE + "/api/appointments/" + encodeURIComponent(appointmentId), { headers: authHeaders() });
        const data = await readJsonResponse(res);
        const item = data.appointment;

        if(!item){
            toastError("Appointment not found");
            return;
        }

        selectedDoctorAppointmentId = appointmentId;
        document.getElementById("doctorModalTitle").textContent = item.patient?.name || "Patient";
        document.getElementById("doctorModalMeta").textContent = `${new Date(item.scheduledAt).toLocaleString()} • ${item.patient?.email || ""}`;
        document.getElementById("doctorModalReason").textContent = item.reason || "—";
        document.getElementById("doctorModalSymptoms").textContent = item.symptoms?.trim()
            ? item.symptoms
            : "Patient did not elaborate further.";
        document.getElementById("doctorModalPhone").textContent = item.phone?.trim()
            ? item.phone
            : "—";

        document.getElementById("doctorModalDemo").textContent =
            `Age ${item.patientAge != null ? item.patientAge : "—"} • ${formatGender(item.gender)}`;

        document.getElementById("doctorModalStatus").innerHTML = appointmentStatusMarkup(item.status);

        const approveBtn = document.getElementById("doctorApproveBtn");
        if(approveBtn){
            if(item.status === "pending"){
                approveBtn.hidden = false;
                approveBtn.disabled = false;
                approveBtn.textContent = "Accept appointment";
            }else{
                approveBtn.hidden = true;
            }
        }

        document.getElementById("doctorPatientModal").style.display = "flex";
    }catch(error){
        handleRequestError(error);
    }
}

function closeDoctorModal(){
    const modal = document.getElementById("doctorPatientModal");

    if(modal){
        modal.style.display = "none";
    }
    selectedDoctorAppointmentId = "";

    const approveBtn = document.getElementById("doctorApproveBtn");
    if(approveBtn){
        approveBtn.hidden = false;
        approveBtn.disabled = false;
        approveBtn.textContent = "Accept appointment";
    }
}

async function approveSelectedAppointment(){
    if(!selectedDoctorAppointmentId){
        return;
    }
    await approveAppointmentById(selectedDoctorAppointmentId, true);
}

async function approveAppointmentById(appointmentId, closeModal = false){
    try{
        const res = await fetch(BASE + "/api/appointments/" + encodeURIComponent(appointmentId) + "/approve", {
            method: "POST",
            headers: authHeaders(),
        });
        const data = await readJsonResponse(res);
        toastSuccess(data.msg || "Appointment approved");

        if(closeModal){
            closeDoctorModal();
        }

        await loadDoctorDashboard();
    }catch(error){
        handleRequestError(error);
    }
}
