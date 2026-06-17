/** @format */

// =============================================================================
// auth.js — de logica achter de LOGIN-/REGISTRATIEpagina (auth.html).
// Staat los van de app-modules: auth.html gebruikt geen ES-modules, daarom
// heeft dit bestand zijn eigen kopie van de backend-URL-logica.
// =============================================================================

// ── Password visibility toggle ────────────────────────────────────────────
// Knopjes die een wachtwoordveld tonen/verbergen (oog-icoon).

document.querySelectorAll("[data-toggle-password]").forEach((btn) => {
  const targetId = btn.dataset.togglePassword;
  const input = document.getElementById(targetId);
  if (!input) return;
  btn.addEventListener("click", () => {
    // Wissel tussen type "password" (verborgen) en "text" (zichtbaar).
    const isText = input.getAttribute("type") === "text";
    input.setAttribute("type", isText ? "password" : "text");
    btn.style.color = isText ? "#b3b5b8" : "#141414";
  });
});

// Oudere variant met vaste id's (voor het geval die nog gebruikt wordt).
const togglePassword = document.getElementById("togglePassword");
const passwordInput = document.getElementById("passwordInput");
if (togglePassword && passwordInput) {
  togglePassword.addEventListener("click", () => {
    const isText = passwordInput.getAttribute("type") === "text";
    passwordInput.setAttribute("type", isText ? "password" : "text");
    togglePassword.style.color = isText ? "#b3b5b8" : "#141414";
  });
}

// ── Sidebar search / scroll (decoratief op de landingspagina) ──────────────

const searchInput = document.getElementById("searchInput");
const clearIcon = document.getElementById("clearIcon");
if (searchInput && clearIcon) {
  // Toon het kruisje om te wissen zodra er tekst staat.
  searchInput.addEventListener("input", () => {
    clearIcon.style.display = searchInput.value.length > 0 ? "block" : "none";
  });
  clearIcon.addEventListener("click", () => {
    searchInput.value = "";
    clearIcon.style.display = "none";
    searchInput.focus();
  });
}

const scrollArea = document.getElementById("scrollArea");
const chatBtn = document.getElementById("chatBtn");
if (scrollArea && chatBtn) {
  // Toon een knop pas nadat de gebruiker een stuk gescrold heeft.
  scrollArea.addEventListener("scroll", () => {
    chatBtn.classList.toggle("show", scrollArea.scrollTop > 200);
  });
}

// ── Backend origin resolution ─────────────────────────────────────────────
// Zelfde logica als in utils/config.js, maar hier herhaald omdat deze pagina
// geen modules importeert.

function normalizeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function getStoredBackendOrigin() {
  try {
    return localStorage.getItem("snap_backend_origin") || "";
  } catch {
    return "";
  }
}

function setStoredBackendOrigin(value) {
  try {
    localStorage.setItem("snap_backend_origin", value);
  } catch {}
}

const BACKEND_ORIGIN = (() => {
  const { protocol, hostname, port, origin } = window.location;
  const serverFromUrl = new URLSearchParams(window.location.search).get(
    "server"
  );
  const configured = normalizeOrigin(serverFromUrl || getStoredBackendOrigin());
  if (configured) {
    setStoredBackendOrigin(configured);
    return configured;
  }
  if (protocol === "file:") return "http://127.0.0.1:5000";
  if (["5500", "5173", "3000"].includes(port))
    return `http://${hostname || "127.0.0.1"}:5000`;
  return origin;
})();

const API = `${BACKEND_ORIGIN}/api`;

// ── UI helpers ────────────────────────────────────────────────────────────
// Tonen/verbergen van fout- en succesboodschappen op de pagina.

function showError(msg) {
  const el = document.getElementById("error-msg");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  const ok = document.getElementById("success-msg");
  if (ok) ok.style.display = "none";
}

function showSuccess(msg) {
  const el = document.getElementById("success-msg");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  const err = document.getElementById("error-msg");
  if (err) err.style.display = "none";
}

function hideMessages() {
  ["error-msg", "success-msg"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
}

// ── Tab switching ─────────────────────────────────────────────────────────
// Wisselen tussen het inlog- en registratieformulier (window.* zodat de
// onclick="switchTab(...)" in de HTML erbij kan).

window.switchTab = function (tab) {
  hideMessages();
  document
    .querySelectorAll(".auth-tab")
    .forEach((t) => t.classList.remove("active"));
  document.getElementById("tab-" + tab)?.classList.add("active");

  const isLogin = tab === "login";
  document.getElementById("form-login").style.display = isLogin ? "" : "none";
  document.getElementById("form-register").style.display = isLogin
    ? "none"
    : "";
  document.getElementById("auth-title").textContent = isLogin
    ? "Inloggen bij Snapchat"
    : "Account aanmaken";
};

// ── Formulier versturen (gedeeld voor login én register) ───────────────────

// Algemene functie die een formulier naar de backend stuurt en de knop tijdelijk
// uitschakelt. bodyFn() levert de data die verstuurd wordt.
async function submitForm(
  formId,
  btnId,
  btnLabel,
  endpoint,
  bodyFn,
  successMsg
) {
  hideMessages();
  const btn = document.getElementById(btnId);
  btn.disabled = true; // voorkom dubbel klikken
  btn.textContent = "Bezig...";

  try {
    const res = await fetch(`${API}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // sessie-cookie meesturen
      body: JSON.stringify(bodyFn()),
    });
    const data = await res.json();
    if (res.ok) {
      showSuccess(successMsg);
      // Na succes doorsturen naar de hoofd-app.
      setTimeout(() => (window.location.href = "./pages/snap.html"), 1000);
    } else {
      showError(data.error || "Er ging iets mis.");
    }
  } catch {
    showError(
      "Kan geen verbinding maken met de server. Is de backend gestart?"
    );
  }

  btn.disabled = false;
  btn.textContent = btnLabel;
}

// Koppel het login-formulier.
document.getElementById("form-login")?.addEventListener("submit", (e) => {
  e.preventDefault(); // voorkom dat de pagina herlaadt
  submitForm(
    "form-login",
    "btn-login",
    "Inloggen",
    "/login",
    () => ({
      username_or_email: document.getElementById("login-username").value,
      password: document.getElementById("login-password").value,
    }),
    "Succesvol ingelogd! Je wordt doorgestuurd..."
  );
});

// Koppel het registratie-formulier.
document.getElementById("form-register")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const pw = document.getElementById("req-password").value;
  if (pw.length < 8) {
    showError("Wachtwoord moet minimaal 8 tekens bevatten");
    return;
  }
  if (!/[^A-Za-z0-9]/.test(pw)) {
    showError("Wachtwoord moet minimaal 1 speciaale teken bevatten");
    return;
  }
  submitForm(
    "form-register",
    "btn-register",
    "Account aanmaken",
    "/register",
    () => ({
      username: document.getElementById("reg-username").value,
      email: document.getElementById("reg-email").value,
      password: pw,
    }),
    "Account aangemaakt! Je wordt doorgestuurd..."
  );
});

// ── Auto-redirect als je al ingelogd bent ─────────────────────────────────
// Bij het laden: vraag /me op. Lukt dat, dan ben je al ingelogd -> meteen door
// naar de app, zodat je niet opnieuw hoeft in te loggen.

(async () => {
  try {
    const res = await fetch(`${API}/me`, { credentials: "include" });
    if (res.ok) window.location.href = "./pages/snap.html";
  } catch {}
})();
