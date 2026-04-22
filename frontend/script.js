const BASE = "https://full-health-record-system.onrender.com";
const THEME_STORAGE_KEY = "healthsys-theme";

let chartInstance = null;
let latestPatients = [];

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
        alert("Session expired. Please login again.");
        logout(false);
        return;
    }

    alert(error.message || "Something went wrong");
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
        alert("Please login first");
        window.location.href = "login.html";
        return false;
    }

    return true;
}

/* ================= REGISTER ================= */
async function register(){
    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if(!name || !email || !password){
        alert("Fill all fields");
        return;
    }

    try{
        const res = await fetch(BASE + "/api/auth/register",{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body: JSON.stringify({name,email,password})
        });

        const data = await readJsonResponse(res);
        alert(data.msg || "Registered Successfully");
    }catch(error){
        handleRequestError(error);
    }
}

/* ================= LOGIN ================= */
async function login(){
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if(!email || !password){
        alert("Fill all fields");
        return;
    }

    try{
        const res = await fetch(BASE + "/api/auth/login",{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body: JSON.stringify({email,password})
        });

        const data = await readJsonResponse(res);

        if(!data.token){
            alert(data.msg || "Login failed");
            return;
        }

        localStorage.setItem("token", data.token);

        alert("Login Successful");
        window.location.href = "dashboard.html";
    }catch(error){
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
        alert("Fill all fields with a valid age");
        return;
    }

    try{
        const res = await fetch(BASE + "/api/patient/add",{
            method:"POST",
            headers:authHeaders({"Content-Type":"application/json"}),
            body: JSON.stringify({name, age, disease})
        });

        const data = await readJsonResponse(res);
        alert(data.msg);

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
        alert(data.msg);

        refreshDashboard();
    }catch(error){
        handleRequestError(error);
    }
}

/* ================= EDIT ================= */
async function editPatient(id, oldName, oldAge, oldDisease){
    const name = prompt("Enter name:", oldName);
    const age = prompt("Enter age:", oldAge);
    const disease = prompt("Enter disease:", oldDisease);

    if(!name || !age || !disease || !isValidAge(age)){
        alert("Invalid input");
        return;
    }

    try{
        const res = await fetch(BASE + "/api/patient/update/" + encodeURIComponent(id),{
            method:"PUT",
            headers:authHeaders({"Content-Type":"application/json"}),
            body: JSON.stringify({
                name: name.trim(),
                age: age.trim(),
                disease: disease.trim()
            })
        });

        const data = await readJsonResponse(res);
        alert(data.msg);

        refreshDashboard();
    }catch(error){
        handleRequestError(error);
    }
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
        const age = prompt("Enter age");

        if(age === null){
            return;
        }

        if(!age.trim() || !isValidAge(age.trim())){
            alert("Enter a valid age");
            return;
        }

        try{
            const res = await fetch(BASE + "/api/predict/" + encodeURIComponent(age.trim()), {
                headers:authHeaders()
            });
            const data = await readJsonResponse(res);
            alert("Prediction: " + data.result);
        }catch(error){
            handleRequestError(error);
        }

        return;
    }

    const age = ageInput.value.trim();

    if(!age || !isValidAge(age) || Number(age) > 130){
        alert("Enter a valid age");
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
        alert(`${data.prediction} (${data.confidence}% confidence)`);
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

    if(showAlert){
        alert("Logged out");
    }

    window.location.href = "login.html";
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
window.addEventListener("load", hideLoader);
