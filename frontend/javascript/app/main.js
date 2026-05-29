/** @format */

/**
 * main.js — Application bootstrap.
 *
 * This replaces the old monolithic snap.js.  It imports focused modules and
 * wires everything together.  The <script type="module"> tag in snap.html
 * points here.
 */

import { state } from "./state.js";
import { api, toast } from "../utils/api.js";
import { initials, updateRelativeLabels } from "../utils/dom.js";
import { applyTheme, setupProfile, showSettingsModal } from "./profile.js";
import { setupSidebarSearch, refreshSocialData, loadBlockedUsers } from "./sidebar.js";
import { renderHome } from "./chat.js";
import { setupSocket } from "./socket.js";
import { cleanupVoiceRecording } from "./chat.js";
import { stopCameraStream } from "./camera.js";
import { cleanupCall } from "./calls.js";
import { showAddFriendModal, showCreateGroupModal } from "./modals.js";
import { showCamera } from "./camera.js";

// ── DOM element references ────────────────────────────────────────────────

const els = {
  body: document.body,
  profileBtn: document.getElementById("profile-icon"),
  cameraBtn: document.getElementById("camera-btn"),
  settingsBtn: document.getElementById("settings-btn"),
  groupChatBtn: document.getElementById("group-chat-btn"),
  addFriendBtn: document.getElementById("add-friend-btn"),
  sidebarSearch: document.getElementById("sidebar-search"),
  profileModal: document.getElementById("profile-modal"),
  profileClose: document.getElementById("profile-close"),
  modalAvatar: document.getElementById("modal-avatar"),
  modalUsername: document.getElementById("modal-username"),
  modalEmail: document.getElementById("modal-email"),
  avatarGrid: document.getElementById("avatar-grid"),
  customAvatarInput: document.getElementById("custom-avatar-input"),
  customAvatarBtn: document.getElementById("custom-avatar-btn"),
  avatarFileInput: document.getElementById("avatar-file-input"),
  logoutBtn: document.getElementById("logout-btn"),
};

// ── Init ──────────────────────────────────────────────────────────────────

async function init() {
  try {
    // Load server config (ICE servers etc.)
    try {
      state.config = await api("/config");
    } catch {}

    // Load current user; redirect to auth if not logged in
    const data = await api("/me");
    state.user = data.user;
    els.profileBtn.textContent = initials(state.user.username);
    if (state.user.avatar) {
      els.profileBtn.style.backgroundImage = `url("${state.user.avatar}")`;
    }
    applyTheme();

    setupSocket();
    setupProfile(els);
    setupGlobalButtons();
    setupSidebarSearch();
    renderHome();

    await refreshSocialData();

    state.relativeTimer = setInterval(updateRelativeLabels, 20000);
    updateRelativeLabels();
  } catch {
    window.location.href = "../auth.html";
  }
}

function setupGlobalButtons() {
  els.addFriendBtn.addEventListener("click", showAddFriendModal);
  els.groupChatBtn.addEventListener("click", showCreateGroupModal);
  els.cameraBtn.addEventListener("click", showCamera);
  els.settingsBtn.addEventListener("click", async () => {
    await loadBlockedUsers();
    showSettingsModal();
  });
}

// ── Cleanup on unload ─────────────────────────────────────────────────────

window.addEventListener("beforeunload", () => {
  cleanupVoiceRecording();
  stopCameraStream();
  cleanupCall();
  clearInterval(state.relativeTimer);
});

init();
