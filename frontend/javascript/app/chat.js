/** @format */

import { state } from "./state.js";
import { api, toast } from "../utils/api.js";
import { escapeHtml, initials, avatarMarkup, groupAvatarMarkup, updateRelativeLabels, scrollMessagesToBottom, blobToDataUrl } from "../utils/dom.js";
import { canUseMediaDevices, mediaUnavailableMessage, readMediaError, getSupportedAudioMimeType } from "../utils/media.js";
import { loadFriends, loadGroups } from "./sidebar.js";

const els = () => ({
  main: document.getElementById("main-content"),
  body: document.body,
});

// ── Chat shell rendering ──────────────────────────────────────────────────

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

  document.getElementById("home-add-friend").addEventListener("click", () => import("./modals.js").then(m => m.showAddFriendModal()));
  document.getElementById("home-create-group").addEventListener("click", () => import("./modals.js").then(m => m.showCreateGroupModal()));
  document.getElementById("home-camera").addEventListener("click", () => import("./camera.js").then(m => m.showCamera()));
}

export async function openChat(friend) {
  if (state.selectedFriend?.id && state.socket) state.socket.emit("leave_chat", { friend_id: state.selectedFriend.id });
  if (state.selectedGroup?.id && state.socket) state.socket.emit("leave_group_chat", { group_id: state.selectedGroup.id });

  state.selectedFriend = friend;
  state.selectedGroup = null;
  state.messages = [];

  const { renderFriendsList } = await import("./sidebar.js");
  renderFriendsList();
  renderChatShell(friend);

  if (state.socket) state.socket.emit("join_chat", { friend_id: friend.id });

  try {
    const data = await api(`/messages/${friend.id}`);
    state.messages = data.messages || [];
    renderMessages();
    await loadFriends();
  } catch (err) {
    toast(err.message, "error");
  }
}

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

  body.classList.add("chat-open");
}

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

// ── Message rendering ─────────────────────────────────────────────────────

export function renderMessages() {
  const container = document.getElementById("chat-messages");
  if (!container) return;

  if (!state.messages.length) {
    container.innerHTML = `<div class="empty-state">Stuur het eerste bericht.</div>`;
    return;
  }

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

  container.querySelectorAll("[data-delete-message]").forEach((btn) => {
    btn.addEventListener("click", () => deleteMessage(btn.dataset.deleteMessage));
  });

  container.querySelectorAll("[data-open-snap]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const msg = state.messages.find((m) => String(m.id) === btn.dataset.openSnap);
      if (msg) await openSnap(msg);
    });
  });

  updateRelativeLabels();
  scrollMessagesToBottom();
}

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

function renderSnapBubble(msg) {
  const own = msg.sender_id === state.user.id;
  const status = msg.snap_status || "new";
  const disabled = !msg.can_open_snap && !msg.snap_saved;

  const snapLabels = {
    saved: ["Bewaard in chat", "Opgeslagen"],
    replay: ["Replay snap", "Nog 1 keer"],
    expired: ["Snap verlopen", "Niet meer beschikbaar"],
  };
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

// ── Snap actions ──────────────────────────────────────────────────────────

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

// ── Message state helpers ─────────────────────────────────────────────────

export function updateMessageInState(msg) {
  if (!msg) return;
  const idx = state.messages.findIndex((m) => m.id === msg.id);
  if (idx >= 0) state.messages[idx] = { ...state.messages[idx], ...msg };
  else state.messages.push(msg);
}

export function addOrUpdateMessage(msg) {
  if (!msg) return;
  updateMessageInState(msg);
  renderMessages();
}

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

// ── Send text ─────────────────────────────────────────────────────────────

async function sendTextMessage(e) {
  e.preventDefault();
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if ((!state.selectedFriend && !state.selectedGroup) || !text) return;

  input.value = "";
  emitStopTyping();

  try {
    const data = state.selectedGroup
      ? await api(`/groups/${state.selectedGroup.id}/messages/send`, { method: "POST", body: JSON.stringify({ text }) })
      : await api("/messages/send", { method: "POST", body: JSON.stringify({ receiver_id: state.selectedFriend.id, text }) });
    addOrUpdateMessage(data.message);
    await (state.selectedGroup ? loadGroups() : loadFriends());
  } catch (err) {
    input.value = text;
    toast(err.message, "error");
  }
}

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

// ── Typing ────────────────────────────────────────────────────────────────

function handleTyping() {
  if (!state.socket || (!state.selectedFriend && !state.selectedGroup)) return;
  if (state.selectedGroup) state.socket.emit("group_typing", { group_id: state.selectedGroup.id });
  else state.socket.emit("typing", { friend_id: state.selectedFriend.id });
  clearTimeout(state.typingTimer);
  state.typingTimer = setTimeout(emitStopTyping, 1200);
}

function emitStopTyping() {
  if (!state.socket) return;
  if (state.selectedGroup) state.socket.emit("group_stop_typing", { group_id: state.selectedGroup.id });
  else if (state.selectedFriend) state.socket.emit("stop_typing", { friend_id: state.selectedFriend.id });
}

// ── Voice recording ───────────────────────────────────────────────────────

async function toggleVoiceRecording() {
  if (state.mediaRecorder?.state === "recording") { stopVoiceRecording(); return; }
  if (!state.selectedFriend && !state.selectedGroup) return;
  if (!canUseMediaDevices()) { toast(mediaUnavailableMessage("microfoon"), "error"); return; }

  const btn = document.getElementById("voice-btn");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = getSupportedAudioMimeType();

    state.voiceStream = stream;
    state.voiceChunks = [];
    state.recordingFriendId = state.selectedFriend?.id || null;
    state.recordingGroupId = state.selectedGroup?.id || null;
    state.recordingStartedAt = Date.now();
    state.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

    state.mediaRecorder.addEventListener("dataavailable", (e) => {
      if (e.data.size > 0) state.voiceChunks.push(e.data);
    });

    state.mediaRecorder.addEventListener("stop", async () => {
      clearTimeout(state.voiceTimer);
      state.voiceTimer = null;
      stream.getTracks().forEach((t) => t.stop());
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

export function stopVoiceRecording() {
  if (state.mediaRecorder?.state === "recording") state.mediaRecorder.stop();
}

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

async function sendVoiceMessage(receiverId, groupId = null) {
  if ((!receiverId && !groupId) || !state.voiceChunks.length) return;

  const blob = new Blob(state.voiceChunks, {
    type: state.mediaRecorder?.mimeType || state.voiceChunks[0].type || "audio/webm",
  });
  const duration = Math.max(1, Math.round((Date.now() - state.recordingStartedAt) / 1000));
  const voiceData = await blobToDataUrl(blob);

  try {
    const data = groupId
      ? await api(`/groups/${groupId}/messages/send`, { method: "POST", body: JSON.stringify({ is_voice: true, voice_data: voiceData, voice_duration: duration }) })
      : await api("/messages/send", { method: "POST", body: JSON.stringify({ receiver_id: receiverId, is_voice: true, voice_data: voiceData, voice_duration: duration }) });

    const inCurrentChat = groupId
      ? state.selectedGroup && Number(groupId) === state.selectedGroup.id
      : state.selectedFriend && Number(receiverId) === state.selectedFriend.id;

    if (inCurrentChat) addOrUpdateMessage(data.message);
    else toast("Spraakbericht verstuurd.", "success");

    await (groupId ? loadGroups() : loadFriends());
  } catch (err) {
    toast(err.message, "error");
  } finally {
    state.voiceChunks = [];
  }
}

// ── Block ─────────────────────────────────────────────────────────────────

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
