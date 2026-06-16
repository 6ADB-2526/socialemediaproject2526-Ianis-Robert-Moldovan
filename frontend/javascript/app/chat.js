/** @format */

// =============================================================================
// chat.js — HET GROOTSTE app-bestand: het chatvenster zelf.
// Verantwoordelijk voor: een gesprek openen, berichten tekenen, tekst/snap/voice
// versturen, snaps openen/bewaren, berichten verwijderen, en 'typt...'-signalen.
// =============================================================================

import { state } from "./state.js";
import { api, toast } from "../utils/api.js";
import { escapeHtml, initials, avatarMarkup, groupAvatarMarkup, updateRelativeLabels, scrollMessagesToBottom, blobToDataUrl } from "../utils/dom.js";
import { canUseMediaDevices, mediaUnavailableMessage, readMediaError, getSupportedAudioMimeType } from "../utils/media.js";
import { loadFriends, loadGroups } from "./sidebar.js";

// Kleine helper: verwijzingen naar het hoofdgebied en de body.
const els = () => ({
  main: document.getElementById("main-content"),
  body: document.body,
});

// ── Beginscherm ────────────────────────────────────────────────────────────

// Tekent het startscherm (als er nog geen chat open is).
export function renderHome() {
  const { main } = els();
  main.innerHTML = `
    <section class="empty-chat-state">
      <div class="empty-chat-inner">
        <h1>Snapchat</h1>
        <p>Kies een vriend, maak een groep of stuur een snap.</p>
        <div class="home-actions">
          <button class="primary-wide-btn" id="home-add-friend" type="button">Vriend zoeken</button>
          <button class="secondary-wide-btn" id="home-create-group" type="button">Groep maken</button>
          <button class="secondary-wide-btn" id="home-camera" type="button">Camera openen</button>
        </div>
      </div>
    </section>
  `;

  // De knoppen laden de juiste module pas in wanneer je klikt (lui laden).
  document.getElementById("home-add-friend").addEventListener("click", () => import("./modals.js").then(m => m.showAddFriendModal()));
  document.getElementById("home-create-group").addEventListener("click", () => import("./modals.js").then(m => m.showCreateGroupModal()));
  document.getElementById("home-camera").addEventListener("click", () => import("./camera.js").then(m => m.showCamera()));
}

// ── Een chat openen ──────────────────────────────────────────────────────────

// Opent een 1-op-1 gesprek met een vriend.
export async function openChat(friend) {
  // Verlaat eerst de kamer van de vorige open chat/groep.
  if (state.selectedFriend?.id && state.socket) state.socket.emit("leave_chat", { friend_id: state.selectedFriend.id });
  if (state.selectedGroup?.id && state.socket) state.socket.emit("leave_group_chat", { group_id: state.selectedGroup.id });

  // Onthoud welke chat nu open is.
  state.selectedFriend = friend;
  state.selectedGroup = null;
  state.messages = [];

  const { renderFriendsList } = await import("./sidebar.js");
  renderFriendsList();      // markeer deze vriend als 'actief' in de lijst
  renderChatShell(friend);  // teken het lege chatvenster

  // Sluit aan bij de realtime-kamer van dit gesprek.
  if (state.socket) state.socket.emit("join_chat", { friend_id: friend.id });

  // Haal de berichten op en teken ze.
  try {
    const data = await api(`/messages/${friend.id}`);
    state.messages = data.messages || [];
    renderMessages();
    await loadFriends();
  } catch (err) {
    toast(err.message, "error");
  }
}

// Opent een groepschat (gelijkaardig aan openChat, maar voor groepen).
export async function openGroupChat(group) {
  if (state.selectedFriend?.id && state.socket) state.socket.emit("leave_chat", { friend_id: state.selectedFriend.id });
  if (state.selectedGroup?.id && state.socket) state.socket.emit("leave_group_chat", { group_id: state.selectedGroup.id });

  state.selectedFriend = null;
  state.selectedGroup = group;
  state.messages = [];

  const { renderFriendsList } = await import("./sidebar.js");
  renderFriendsList();
  renderGroupChatShell(group);

  if (state.socket) state.socket.emit("join_group_chat", { group_id: group.id });

  try {
    const data = await api(`/groups/${group.id}/messages`);
    state.messages = data.messages || [];
    renderMessages();
    await loadGroups();
  } catch (err) {
    toast(err.message, "error");
  }
}

// Tekent het 'skelet' van een 1-op-1 chat (header, berichtengebied, invoerbalk).
function renderChatShell(friend) {
  const { main, body } = els();
  main.innerHTML = `
    <section class="chat-view-wrapper">
      <header class="chat-header">
        <button class="mobile-back-btn" id="mobile-back-btn" type="button">Terug</button>
        <div class="chat-header-left">
          ${avatarMarkup(friend, "chat-avatar-small-img")}
          <div>
            <div class="chat-name">${escapeHtml(friend.username)}</div>
            <div class="typing-indicator" id="typing-indicator"></div>
          </div>
        </div>
        <div class="chat-header-actions">
          <button class="icon-btn" id="audio-call-btn" type="button" title="Audiogesprek">Bel</button>
          <button class="icon-btn" id="video-call-btn" type="button" title="Videogesprek">Video</button>
          <button class="icon-btn danger" id="block-user-btn" type="button" title="Blokkeren">Blok</button>
        </div>
      </header>
      <div class="chat-messages" id="chat-messages"><div class="empty-state">Berichten laden...</div></div>
      <form class="chat-input-bar-snap" id="chat-form">
        <button class="input-snap-camera-circle" id="snap-input-btn" type="button" title="Snap maken">Cam</button>
        <div class="input-snap-text-wrapper">
          <input id="chat-input" type="text" placeholder="Stuur een chat" autocomplete="off" />
        </div>
        <button class="voice-btn" id="voice-btn" type="button" title="Spraakbericht opnemen">Mic</button>
        <button class="send-btn" id="send-message-btn" type="submit">Stuur</button>
      </form>
    </section>
  `;

  // Alle knoppen en het formulier koppelen aan hun functie.
  document.getElementById("chat-form").addEventListener("submit", sendTextMessage);
  document.getElementById("chat-input").addEventListener("input", handleTyping);
  document.getElementById("voice-btn").addEventListener("click", toggleVoiceRecording);
  document.getElementById("audio-call-btn").addEventListener("click", () => import("./calls.js").then(m => m.startCall("voice")));
  document.getElementById("video-call-btn").addEventListener("click", () => import("./calls.js").then(m => m.startCall("video")));
  document.getElementById("snap-input-btn").addEventListener("click", () => import("./camera.js").then(m => m.showCamera()));
  document.getElementById("block-user-btn").addEventListener("click", blockSelectedFriend);
  document.getElementById("mobile-back-btn").addEventListener("click", () => {
    stopVoiceRecording();
    body.classList.remove("chat-open");
    state.selectedFriend = null;
    renderHome();
    import("./sidebar.js").then(m => m.renderFriendsList());
  });

  body.classList.add("chat-open");  // voor de mobiele weergave
}

// Tekent het skelet van een GROEPschat (lijkt op renderChatShell, geen snap/bel).
function renderGroupChatShell(group) {
  const { main, body } = els();
  main.innerHTML = `
    <section class="chat-view-wrapper">
      <header class="chat-header">
        <button class="mobile-back-btn" id="mobile-back-btn" type="button">Terug</button>
        <div class="chat-header-left">
          ${groupAvatarMarkup(group, state.user?.id, "chat-group-avatar")}
          <div>
            <div class="chat-name">${escapeHtml(group.name)}</div>
            <div class="typing-indicator" id="typing-indicator">${group.member_count || 0} leden</div>
          </div>
        </div>
        <div class="chat-header-actions">
          <button class="icon-btn" id="group-info-btn" type="button" title="Groepsleden">Leden</button>
        </div>
      </header>
      <div class="chat-messages" id="chat-messages"><div class="empty-state">Berichten laden...</div></div>
      <form class="chat-input-bar-snap" id="chat-form">
        <div class="input-snap-text-wrapper">
          <input id="chat-input" type="text" placeholder="Stuur een bericht in de groep" autocomplete="off" />
        </div>
        <button class="voice-btn" id="voice-btn" type="button" title="Spraakbericht opnemen">Mic</button>
        <button class="send-btn" id="send-message-btn" type="submit">Stuur</button>
      </form>
    </section>
  `;

  document.getElementById("chat-form").addEventListener("submit", sendTextMessage);
  document.getElementById("chat-input").addEventListener("input", handleTyping);
  document.getElementById("voice-btn").addEventListener("click", toggleVoiceRecording);
  document.getElementById("group-info-btn").addEventListener("click", () => import("./modals.js").then(m => m.showGroupInfoModal(group)));
  document.getElementById("mobile-back-btn").addEventListener("click", () => {
    stopVoiceRecording();
    if (state.socket) state.socket.emit("leave_group_chat", { group_id: group.id });
    body.classList.remove("chat-open");
    state.selectedGroup = null;
    renderHome();
    import("./sidebar.js").then(m => m.renderFriendsList());
  });

  body.classList.add("chat-open");
}

// ── Berichten tekenen ────────────────────────────────────────────────────────

// Tekent alle berichten van de open chat in het berichtengebied.
export function renderMessages() {
  const container = document.getElementById("chat-messages");
  if (!container) return;

  if (!state.messages.length) {
    container.innerHTML = `<div class="empty-state">Stuur het eerste bericht.</div>`;
    return;
  }

  // Voor elk bericht een 'bubbel' bouwen. 'own' = is dit mijn eigen bericht?
  container.innerHTML = state.messages.map((msg) => {
    const own = msg.sender_id === state.user.id;
    return `
      <article class="message-container ${own ? "own-message" : "their-message"}" data-message-id="${msg.id}">
        <div class="message-avatar">${own ? initials(state.user.username) : initials(msg.sender_username)}</div>
        <div class="message-stack">
          <div class="message-meta">
            <span class="message-sender">${own ? "Jij" : escapeHtml(msg.sender_username)}</span>
            <span class="sent-status" ${own ? `data-sent-time="${msg.created_at}"` : `data-relative-time="${msg.created_at}"`}></span>
          </div>
          ${renderMessageContent(msg)}
        </div>
        <div class="message-actions">
          ${own ? `<button class="delete-msg" type="button" data-delete-message="${msg.id}" title="Verwijderen">x</button>` : ""}
        </div>
      </article>
    `;
  }).join("");

  // Verwijder-knoppen koppelen.
  container.querySelectorAll("[data-delete-message]").forEach((btn) => {
    btn.addEventListener("click", () => deleteMessage(btn.dataset.deleteMessage));
  });

  // Snap-openen-knoppen koppelen.
  container.querySelectorAll("[data-open-snap]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const msg = state.messages.find((m) => String(m.id) === btn.dataset.openSnap);
      if (msg) await openSnap(msg);
    });
  });

  updateRelativeLabels();
  scrollMessagesToBottom();  // automatisch naar het nieuwste bericht scrollen
}

// Bepaalt HOE de inhoud van één bericht getoond wordt: voice, snap of tekst.
function renderMessageContent(msg) {
  if (msg.is_voice && msg.voice_data) {
    const dur = msg.voice_duration ? `${msg.voice_duration}s` : "";
    return `
      <div class="voice-message">
        <span class="voice-dot"></span>
        <audio controls src="${escapeHtml(msg.voice_data)}"></audio>
        <span>${dur}</span>
      </div>
    `;
  }
  if (msg.is_snap) return renderSnapBubble(msg);
  return `<div class="text-bubble">${escapeHtml(msg.text)}</div>`;
}

// Tekent de snap-knop met de juiste tekst afhankelijk van de status
// (open / replay / verlopen / bewaard / verstuurd).
function renderSnapBubble(msg) {
  const own = msg.sender_id === state.user.id;
  const status = msg.snap_status || "new";
  const disabled = !msg.can_open_snap && !msg.snap_saved;

  const snapLabels = {
    saved: ["Bewaard in chat", "Opgeslagen"],
    replay: ["Replay snap", "Nog 1 keer"],
    expired: ["Snap verlopen", "Niet meer beschikbaar"],
  };
  // Standaardtekst hangt af van of jij de verzender of ontvanger bent.
  const [label, detail] = snapLabels[status] || (own ? ["Snap verstuurd", "Wacht op openen"] : ["Open snap", "Tik om te bekijken"]);

  return `
    <button class="snap-delivered-bubble ${status === "expired" ? "expired" : ""} ${status === "saved" ? "saved" : ""}"
      type="button" data-open-snap="${msg.id}" ${disabled ? "disabled" : ""}>
      <span class="snap-arrow-icon">Snap</span>
      <span class="snap-copy">
        <span class="delivered-text">${escapeHtml(label)}</span>
        <span class="snap-detail">${escapeHtml(detail)}</span>
      </span>
    </button>
  `;
}

// ── Snap-acties ──────────────────────────────────────────────────────────────

// Opent een snap: vraagt de foto op bij de backend (die de teller bijwerkt) en
// toont hem. Bij een fout (bv. verlopen) wordt de chat herladen.
async function openSnap(msg) {
  try {
    const data = await api(`/messages/${msg.id}/open_snap`, { method: "POST" });
    updateMessageInState(data.message);
    renderMessages();
    showSnapViewer(data.message, data.snap_data);
  } catch (err) {
    toast(err.message, "error");
    await reloadMessages();
  }
}

// Toont de geopende snap in een pop-up, met (indien toegestaan) een bewaar-knop.
function showSnapViewer(msg, snapData) {
  import("./modals.js").then(({ createModal, openModal }) => {
    const canSave = !msg.snap_saved && msg.receiver_id === state.user.id;
    const modal = createModal(
      "snap-viewer-modal",
      "Snap",
      `<div class="story-viewer snap-viewer"><img src="${escapeHtml(snapData || msg.snap_data)}" alt="" /></div>
       <div class="snap-viewer-actions">
         ${canSave
           ? `<button class="primary-wide-btn" id="save-snap-btn" type="button">Bewaar in chat</button>`
           : `<span class="status-pill">${msg.snap_saved ? "Bewaard in chat" : "Niet bewaard"}</span>`}
       </div>`
    );
    openModal(modal);
    modal.querySelector("#save-snap-btn")?.addEventListener("click", () => saveSnapInChat(msg.id, modal));
  });
}

// Bewaart een snap permanent in de chat.
async function saveSnapInChat(msgId, modal) {
  try {
    const data = await api(`/messages/${msgId}/save_snap`, { method: "POST" });
    updateMessageInState(data.message);
    renderMessages();
    toast("Snap bewaard in chat.", "success");
    import("./modals.js").then(m => m.closeModal(modal));
  } catch (err) {
    toast(err.message, "error");
  }
}

// ── Berichten in 'state' bijhouden ──────────────────────────────────────────

// Werkt één bericht bij in de lijst (of voegt het toe als het nieuw is).
export function updateMessageInState(msg) {
  if (!msg) return;
  const idx = state.messages.findIndex((m) => m.id === msg.id);
  if (idx >= 0) state.messages[idx] = { ...state.messages[idx], ...msg };
  else state.messages.push(msg);
}

// Voegt een bericht toe/werkt het bij én hertekent meteen.
export function addOrUpdateMessage(msg) {
  if (!msg) return;
  updateMessageInState(msg);
  renderMessages();
}

// Herlaadt alle berichten van de open chat vanaf de server.
export async function reloadMessages() {
  if (!state.selectedFriend && !state.selectedGroup) return;
  try {
    const data = state.selectedGroup
      ? await api(`/groups/${state.selectedGroup.id}/messages`)
      : await api(`/messages/${state.selectedFriend.id}`);
    state.messages = data.messages || [];
    renderMessages();
  } catch {}
}

// ── Tekst versturen ─────────────────────────────────────────────────────────

// Verstuurt het getypte tekstbericht (werkt voor zowel 1-op-1 als groep).
async function sendTextMessage(e) {
  e.preventDefault();  // voorkom dat het formulier de pagina herlaadt
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if ((!state.selectedFriend && !state.selectedGroup) || !text) return;

  input.value = "";       // veld leegmaken
  emitStopTyping();       // 'typt...' uitzetten

  try {
    // Kies het juiste eindpunt: groep of 1-op-1.
    const data = state.selectedGroup
      ? await api(`/groups/${state.selectedGroup.id}/messages/send`, { method: "POST", body: JSON.stringify({ text }) })
      : await api("/messages/send", { method: "POST", body: JSON.stringify({ receiver_id: state.selectedFriend.id, text }) });
    addOrUpdateMessage(data.message);
    await (state.selectedGroup ? loadGroups() : loadFriends());
  } catch (err) {
    input.value = text;   // bij een fout: zet de tekst terug
    toast(err.message, "error");
  }
}

// Verwijdert een bericht (en haalt het uit de lijst).
async function deleteMessage(msgId) {
  try {
    const endpoint = state.selectedGroup ? `/groups/messages/${msgId}` : `/messages/${msgId}`;
    await api(endpoint, { method: "DELETE" });
    state.messages = state.messages.filter((m) => String(m.id) !== String(msgId));
    renderMessages();
    await (state.selectedGroup ? loadGroups() : loadFriends());
  } catch (err) {
    toast(err.message, "error");
  }
}

// ── Typen ('X typt...') ──────────────────────────────────────────────────────

// Stuurt een 'typt'-signaal naar de andere kant, en plant een 'stop' na 1,2s
// stilte. Zo verschijnt 'typt...' alleen zolang je echt typt.
function handleTyping() {
  if (!state.socket || (!state.selectedFriend && !state.selectedGroup)) return;
  if (state.selectedGroup) state.socket.emit("group_typing", { group_id: state.selectedGroup.id });
  else state.socket.emit("typing", { friend_id: state.selectedFriend.id });
  clearTimeout(state.typingTimer);
  state.typingTimer = setTimeout(emitStopTyping, 1200);
}

// Stuurt het 'stop met typen'-signaal.
function emitStopTyping() {
  if (!state.socket) return;
  if (state.selectedGroup) state.socket.emit("group_stop_typing", { group_id: state.selectedGroup.id });
  else if (state.selectedFriend) state.socket.emit("stop_typing", { friend_id: state.selectedFriend.id });
}

// ── Spraakberichten opnemen ──────────────────────────────────────────────────

// Start of stopt de opname (de microfoon-knop wisselt tussen die twee).
async function toggleVoiceRecording() {
  if (state.mediaRecorder?.state === "recording") { stopVoiceRecording(); return; }
  if (!state.selectedFriend && !state.selectedGroup) return;
  if (!canUseMediaDevices()) { toast(mediaUnavailableMessage("microfoon"), "error"); return; }

  const btn = document.getElementById("voice-btn");
  try {
    // Vraag toegang tot de microfoon en start een MediaRecorder.
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = getSupportedAudioMimeType();

    state.voiceStream = stream;
    state.voiceChunks = [];
    state.recordingFriendId = state.selectedFriend?.id || null;
    state.recordingGroupId = state.selectedGroup?.id || null;
    state.recordingStartedAt = Date.now();
    state.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

    // Verzamel de audio-stukjes terwijl je opneemt.
    state.mediaRecorder.addEventListener("dataavailable", (e) => {
      if (e.data.size > 0) state.voiceChunks.push(e.data);
    });

    // Wanneer de opname stopt: microfoon afsluiten en het bericht versturen.
    state.mediaRecorder.addEventListener("stop", async () => {
      clearTimeout(state.voiceTimer);
      state.voiceTimer = null;
      stream.getTracks().forEach((t) => t.stop());  // microfoon vrijgeven
      state.voiceStream = null;
      const b = document.getElementById("voice-btn");
      if (b) { b.classList.remove("recording"); b.textContent = "Mic"; }
      await sendVoiceMessage(state.recordingFriendId, state.recordingGroupId);
      state.recordingFriendId = null;
      state.recordingGroupId = null;
      state.mediaRecorder = null;
    });

    state.mediaRecorder.start();
    if (btn) { btn.classList.add("recording"); btn.textContent = "Stop"; }
    // Veiligheid: stop automatisch na 60 seconden.
    state.voiceTimer = setTimeout(() => {
      if (state.mediaRecorder?.state === "recording") {
        toast("Opname automatisch gestopt na 60 seconden.", "info");
        stopVoiceRecording();
      }
    }, state.voiceMaxSeconds * 1000);
    toast("Opname gestart.", "success");
  } catch (err) {
    cleanupVoiceRecording();
    toast(readMediaError(err, "microfoon"), "error");
  }
}

// Stopt de lopende opname (de 'stop'-handler hierboven doet de rest).
export function stopVoiceRecording() {
  if (state.mediaRecorder?.state === "recording") state.mediaRecorder.stop();
}

// Ruimt alles van een opname op (microfoon uit, knop terugzetten, timers wissen).
export function cleanupVoiceRecording() {
  clearTimeout(state.voiceTimer);
  state.voiceTimer = null;
  state.voiceStream?.getTracks().forEach((t) => t.stop());
  state.voiceStream = null;
  const btn = document.getElementById("voice-btn");
  if (btn) { btn.classList.remove("recording"); btn.textContent = "Mic"; }
  state.recordingFriendId = null;
  state.recordingGroupId = null;
}

// Zet de opgenomen audio om en verstuurt ze als bericht.
async function sendVoiceMessage(receiverId, groupId = null) {
  if ((!receiverId && !groupId) || !state.voiceChunks.length) return;

  // Plak de stukjes samen tot één audiobestand (blob).
  const blob = new Blob(state.voiceChunks, {
    type: state.mediaRecorder?.mimeType || state.voiceChunks[0].type || "audio/webm",
  });
  // Bereken de duur en zet de audio om naar tekst (data-URL) voor verzending.
  const duration = Math.max(1, Math.round((Date.now() - state.recordingStartedAt) / 1000));
  const voiceData = await blobToDataUrl(blob);

  try {
    const data = groupId
      ? await api(`/groups/${groupId}/messages/send`, { method: "POST", body: JSON.stringify({ is_voice: true, voice_data: voiceData, voice_duration: duration }) })
      : await api("/messages/send", { method: "POST", body: JSON.stringify({ receiver_id: receiverId, is_voice: true, voice_data: voiceData, voice_duration: duration }) });

    // Toon het bericht alleen als die chat nog steeds openstaat.
    const inCurrentChat = groupId
      ? state.selectedGroup && Number(groupId) === state.selectedGroup.id
      : state.selectedFriend && Number(receiverId) === state.selectedFriend.id;

    if (inCurrentChat) addOrUpdateMessage(data.message);
    else toast("Spraakbericht verstuurd.", "success");

    await (groupId ? loadGroups() : loadFriends());
  } catch (err) {
    toast(err.message, "error");
  } finally {
    state.voiceChunks = [];  // opruimen
  }
}

// ── Blokkeren ────────────────────────────────────────────────────────────────

// Blokkeert de vriend van de open chat (na een bevestiging).
async function blockSelectedFriend() {
  if (!state.selectedFriend) return;
  if (!window.confirm(`Wil je ${state.selectedFriend.username} blokkeren?`)) return;
  try {
    await api(`/block/${state.selectedFriend.id}`, { method: "POST" });
    toast("User geblokkeerd.", "success");
    state.selectedFriend = null;
    document.body.classList.remove("chat-open");
    renderHome();
    const { refreshSocialData } = await import("./sidebar.js");
    await refreshSocialData();
  } catch (err) {
    toast(err.message, "error");
  }
}
