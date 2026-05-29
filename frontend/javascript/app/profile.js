/** @format */

import { state } from "./state.js";
import { api, toast } from "../utils/api.js";
import { escapeHtml, avatarMarkup, createModal, openModal, closeModal, blobToDataUrl } from "../utils/dom.js";
import { loadBlockedUsers, refreshSocialData } from "./sidebar.js";

export function setupProfile(els) {
  els.profileBtn.addEventListener("click", showProfileModal);
  els.profileClose.addEventListener("click", () => closeModal(els.profileModal));
  els.profileModal.addEventListener("click", (e) => { if (e.target === els.profileModal) closeModal(els.profileModal); });

  els.customAvatarBtn.addEventListener("click", () => {
    updateAvatar({ avatar_url: els.customAvatarInput.value.trim() }, els);
  });

  els.avatarFileInput.addEventListener("change", async () => {
    const file = els.avatarFileInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast("Kies een afbeelding.", "error"); return; }
    if (file.size > 4 * 1024 * 1024) { toast("Kies een afbeelding kleiner dan 4 MB.", "error"); return; }
    const avatarFile = await blobToDataUrl(file);
    await updateAvatar({ avatar_file: avatarFile }, els);
  });

  els.logoutBtn.addEventListener("click", async () => {
    await api("/logout", { method: "POST" });
    window.location.href = "../auth.html";
  });
}

function showProfileModal() {
  renderProfileModal();
  openModal(document.getElementById("profile-modal"));
}

function renderProfileModal() {
  const modalAvatar = document.getElementById("modal-avatar");
  const modalUsername = document.getElementById("modal-username");
  const modalEmail = document.getElementById("modal-email");
  const avatarGrid = document.getElementById("avatar-grid");

  if (modalAvatar) modalAvatar.innerHTML = avatarMarkup(state.user, "modal-avatar-img");
  if (modalUsername) modalUsername.textContent = state.user.username;
  if (modalEmail) modalEmail.textContent = state.user.email;

  if (avatarGrid) {
    const seeds = [state.user.username, "snap", "ghost", "camera", "chat", "friend"];
    avatarGrid.innerHTML = seeds.map((seed) => {
      const url = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
      return `<button class="avatar-choice" type="button" data-avatar-url="${url}"><img src="${url}" alt="" /></button>`;
    }).join("");
    avatarGrid.querySelectorAll("[data-avatar-url]").forEach((btn) => {
      btn.addEventListener("click", () => updateAvatar({ avatar_url: btn.dataset.avatarUrl }));
    });
  }
}

async function updateAvatar(payload, els) {
  try {
    const data = await api("/me/avatar", { method: "PUT", body: JSON.stringify(payload) });
    state.user = data.user;
    if (els?.profileBtn) els.profileBtn.style.backgroundImage = `url("${state.user.avatar}")`;
    renderProfileModal();
    applyTheme();
    toast("Profielfoto bijgewerkt.", "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

// ── Settings ──────────────────────────────────────────────────────────────

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

  modal.querySelector("#dark-mode-toggle").addEventListener("change", async (e) => {
    await updateSettings({ dark_mode: e.target.checked });
  });
  modal.querySelectorAll("[data-theme-color]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await updateSettings({ theme_color: btn.dataset.themeColor });
      showSettingsModal();
    });
  });

  const blockedBtn = modal.querySelector("#show-blocked-btn");
  if (blockedBtn) {
    blockedBtn.addEventListener("click", () => {
      const list = modal.querySelector("#blocked-users-list");
      list.hidden = !list.hidden;
      renderBlockedUsers(list);
    });
  }
}

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
      renderBlockedUsers(container);
    });
  });
}

async function unblockUser(userId) {
  try {
    await api(`/unblock/${userId}`, { method: "POST" });
    toast("User gedeblokkeerd.", "success");
    await refreshSocialData();
  } catch (err) {
    toast(err.message, "error");
  }
}

// ── Theme ─────────────────────────────────────────────────────────────────

export function applyTheme() {
  document.body.classList.toggle("dark-mode", !!state.user?.dark_mode);
  document.body.dataset.theme = state.user?.theme_color || "purple";
}
