/** @format */

// =============================================================================
// profile.js — PROFIEL en INSTELLINGEN: avatar wijzigen, dark mode/themakleur,
// geblokkeerde gebruikers beheren, en uitloggen.
// =============================================================================

import { state } from "./state.js";
import { api, toast } from "../utils/api.js";
import { escapeHtml, avatarMarkup, createModal, openModal, closeModal, blobToDataUrl } from "../utils/dom.js";
import { loadBlockedUsers, refreshSocialData } from "./sidebar.js";

// Koppelt alle profielknoppen (wordt één keer aangeroepen bij het opstarten).
// 'els' bevat de vaste HTML-elementen die main.js heeft opgezocht.
export function setupProfile(els) {
  els.profileBtn.addEventListener("click", showProfileModal);
  els.profileClose.addEventListener("click", () => closeModal(els.profileModal));
  // Klik op de achtergrond sluit de pop-up.
  els.profileModal.addEventListener("click", (e) => { if (e.target === els.profileModal) closeModal(els.profileModal); });

  // Avatar instellen via een opgegeven URL.
  els.customAvatarBtn.addEventListener("click", () => {
    updateAvatar({ avatar_url: els.customAvatarInput.value.trim() }, els);
  });

  // Avatar instellen via een geüpload bestand (met controles op type en grootte).
  els.avatarFileInput.addEventListener("change", async () => {
    const file = els.avatarFileInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast("Kies een afbeelding.", "error"); return; }
    if (file.size > 4 * 1024 * 1024) { toast("Kies een afbeelding kleiner dan 4 MB.", "error"); return; }
    // Zet het bestand om naar een data-URL (tekst) zodat het als JSON kan.
    const avatarFile = await blobToDataUrl(file);
    await updateAvatar({ avatar_file: avatarFile }, els);
  });

  // Uitloggen: sessie wissen op de server en terug naar de loginpagina.
  els.logoutBtn.addEventListener("click", async () => {
    await api("/logout", { method: "POST" });
    window.location.href = "../auth.html";
  });
}

// Opent de profiel-pop-up (en tekent eerst de inhoud).
function showProfileModal() {
  renderProfileModal();
  openModal(document.getElementById("profile-modal"));
}

// Vult de profiel-pop-up: huidige avatar, naam, e-mail en een keuzeraster avatars.
function renderProfileModal() {
  const modalAvatar = document.getElementById("modal-avatar");
  const modalUsername = document.getElementById("modal-username");
  const modalEmail = document.getElementById("modal-email");
  const avatarGrid = document.getElementById("avatar-grid");

  if (modalAvatar) modalAvatar.innerHTML = avatarMarkup(state.user, "modal-avatar-img");
  if (modalUsername) modalUsername.textContent = state.user.username;
  if (modalEmail) modalEmail.textContent = state.user.email;

  // Een rijtje kant-en-klare avatars (via de gratis DiceBear-dienst).
  if (avatarGrid) {
    const seeds = [state.user.username, "snap", "ghost", "camera", "chat", "friend"];
    avatarGrid.innerHTML = seeds.map((seed) => {
      const url = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
      return `<button class="avatar-choice" type="button" data-avatar-url="${url}"><img src="${url}" alt="" /></button>`;
    }).join("");
    // Klik op een avatar -> die instellen.
    avatarGrid.querySelectorAll("[data-avatar-url]").forEach((btn) => {
      btn.addEventListener("click", () => updateAvatar({ avatar_url: btn.dataset.avatarUrl }));
    });
  }
}

// Stuurt de nieuwe avatar naar de server en werkt de weergave bij.
async function updateAvatar(payload, els) {
  try {
    const data = await api("/me/avatar", { method: "PUT", body: JSON.stringify(payload) });
    state.user = data.user;   // bewaar de bijgewerkte gebruiker
    // Werk de profielknop in de hoek meteen bij.
    if (els?.profileBtn) els.profileBtn.style.backgroundImage = `url("${state.user.avatar}")`;
    renderProfileModal();
    applyTheme();
    toast("Profielfoto bijgewerkt.", "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

// ── Instellingen ───────────────────────────────────────────────────────────

// Toont de instellingen-pop-up: dark mode, themakleur en geblokkeerde users.
export function showSettingsModal() {
  const modal = createModal("settings-modal", "Instellingen", `
    <div class="settings-panel">
      <label class="toggle-row">
        <span>Dark modus</span>
        <input id="dark-mode-toggle" type="checkbox" ${state.user.dark_mode ? "checked" : ""} />
      </label>
      <div>
        <p class="section-label">Kleur</p>
        <div class="theme-grid">
          ${["yellow", "purple", "blue", "pink", "green"].map((color) => `
            <button class="theme-dot ${state.user.theme_color === color ? "active" : ""}"
              data-theme-color="${color}" type="button" title="${color}"></button>
          `).join("")}
        </div>
      </div>
      ${state.blockedUsers.length ? `
        <button class="secondary-wide-btn" id="show-blocked-btn" type="button">Lijst geblokkeerde users</button>
        <div id="blocked-users-list" class="blocked-users-list" hidden></div>
      ` : ""}
    </div>
  `);
  openModal(modal);

  // Dark mode aan/uit.
  modal.querySelector("#dark-mode-toggle").addEventListener("change", async (e) => {
    await updateSettings({ dark_mode: e.target.checked });
  });
  // Themakleur kiezen (en de pop-up opnieuw tekenen zodat de actieve kleur klopt).
  modal.querySelectorAll("[data-theme-color]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await updateSettings({ theme_color: btn.dataset.themeColor });
      showSettingsModal();
    });
  });

  // Knop om de lijst geblokkeerde gebruikers in/uit te klappen.
  const blockedBtn = modal.querySelector("#show-blocked-btn");
  if (blockedBtn) {
    blockedBtn.addEventListener("click", () => {
      const list = modal.querySelector("#blocked-users-list");
      list.hidden = !list.hidden;
      renderBlockedUsers(list);
    });
  }
}

// Stuurt gewijzigde instellingen naar de server en past het thema toe.
async function updateSettings(payload) {
  try {
    const data = await api("/me/settings", { method: "PUT", body: JSON.stringify(payload) });
    state.user = data.user;
    applyTheme();
    toast("Instellingen opgeslagen.", "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

// Tekent de lijst met geblokkeerde gebruikers (elk met een 'Deblokkeer'-knop).
function renderBlockedUsers(container) {
  if (!container) return;
  container.innerHTML = state.blockedUsers.map((entry) => `
    <div class="compact-user-row">
      ${avatarMarkup(entry.blocked_user, "compact-avatar")}
      <span>${escapeHtml(entry.blocked_user?.username || "Onbekend")}</span>
      <button class="mini-btn" type="button" data-unblock-user="${entry.blocked_user?.id}">Deblokkeer</button>
    </div>
  `).join("");

  container.querySelectorAll("[data-unblock-user]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await unblockUser(btn.dataset.unblockUser);
      renderBlockedUsers(container);   // lijst opnieuw tekenen na deblokkeren
    });
  });
}

// Heft een blokkering op en ververst de sociale data.
async function unblockUser(userId) {
  try {
    await api(`/unblock/${userId}`, { method: "POST" });
    toast("User gedeblokkeerd.", "success");
    await refreshSocialData();
  } catch (err) {
    toast(err.message, "error");
  }
}

// ── Thema ────────────────────────────────────────────────────────────────

// Past het gekozen thema toe op de hele app: dark mode aan/uit + de kleur.
// Werkt via CSS: we zetten een class en een data-attribuut op <body>, de CSS
// doet de rest.
export function applyTheme() {
  document.body.classList.toggle("dark-mode", !!state.user?.dark_mode);
  document.body.dataset.theme = state.user?.theme_color || "purple";
}
