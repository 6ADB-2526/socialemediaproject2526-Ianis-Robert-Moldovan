/** @format */

// =============================================================================
// main.js — HET STARTPUNT van de frontend-app (geladen door snap.html).
// Brengt alle losse modules samen en zet bij het opstarten alles op.
// =============================================================================

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

// ── Verwijzingen naar vaste HTML-elementen (knoppen, modals) ───────────────
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

// ── Init: dit draait zodra de app laadt ────────────────────────────────────

async function init() {
  try {
    // 1) Serverconfig ophalen (ICE-servers e.d.). Faalt het, dan niet erg.
    try {
      state.config = await api("/config");
    } catch {}

    // 2) Ingelogde gebruiker ophalen. Lukt dit niet -> je bent niet ingelogd
    //    en we springen naar de catch (redirect naar de loginpagina).
    const data = await api("/me");
    state.user = data.user;
    els.profileBtn.textContent = initials(state.user.username);
    if (state.user.avatar) {
      els.profileBtn.style.backgroundImage = `url("${state.user.avatar}")`;
    }
    applyTheme();   // dark mode / themakleur toepassen

    // 3) Alles opzetten: socket, profiel, knoppen, zoekbalk, beginscherm.
    setupSocket();
    setupProfile(els);
    setupGlobalButtons();
    setupSidebarSearch();
    renderHome();

    // 4) Sociale data laden (vrienden, groepen, verzoeken, stories).
    await refreshSocialData();

    // 5) Elke 20s de '2 min geleden'-labels verversen.
    state.relativeTimer = setInterval(updateRelativeLabels, 20000);
    updateRelativeLabels();
  } catch {
    // Niet ingelogd of fout -> terug naar de loginpagina.
    window.location.href = "../auth.html";
  }
}

// Koppelt de knoppen in de zijbalk-header aan hun functie.
function setupGlobalButtons() {
  els.addFriendBtn.addEventListener("click", showAddFriendModal);
  els.groupChatBtn.addEventListener("click", showCreateGroupModal);
  els.cameraBtn.addEventListener("click", showCamera);
  els.settingsBtn.addEventListener("click", async () => {
    await loadBlockedUsers();
    showSettingsModal();
  });
}

// ── Opruimen wanneer de pagina sluit ───────────────────────────────────────
// Stop lopende opnames/streams/timers netjes (anders blijft bv. de microfoon aan).

window.addEventListener("beforeunload", () => {
  cleanupVoiceRecording();
  stopCameraStream();
  cleanupCall();
  clearInterval(state.relativeTimer);
});

init();  // start de app
