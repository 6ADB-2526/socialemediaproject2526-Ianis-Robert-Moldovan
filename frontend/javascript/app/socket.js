/** @format */

import { state } from "./state.js";
import { toast } from "../utils/api.js";
import { BACKEND_ORIGIN } from "../utils/config.js";
import { addOrUpdateMessage, updateMessageInState, renderMessages } from "./chat.js";
import { messagePreview, loadFriends, loadGroups, loadRequests } from "./sidebar.js";
import { showIncomingCall, handleCallAnswered, handleWebrtcOffer, handleWebrtcAnswer, handleRemoteCandidate, endCurrentCall } from "./calls.js";

export function setupSocket() {
  // io() is provided by the Socket.IO CDN script included in snap.html
  state.socket = io(BACKEND_ORIGIN, { withCredentials: true, transports: ["polling", "websocket"] });

  state.socket.on("connect", () => {
    if (state.selectedFriend) state.socket.emit("join_chat", { friend_id: state.selectedFriend.id });
    if (state.selectedGroup) state.socket.emit("join_group_chat", { group_id: state.selectedGroup.id });
  });

  state.socket.on("connect_error", () => {
    toast("Realtime verbinding lukt niet. Controleer de server-URL.", "error");
  });

  // ── Direct messages ─────────────────────────────────────────────────────

  state.socket.on("new_message", async (msg) => {
    const inOpenChat = state.selectedFriend && (
      (msg.sender_id === state.selectedFriend.id && msg.receiver_id === state.user.id) ||
      (msg.sender_id === state.user.id && msg.receiver_id === state.selectedFriend.id)
    );
    if (inOpenChat) addOrUpdateMessage(msg);
    else toast(`${msg.sender_username}: ${messagePreview(msg)}`, "info");
    await loadFriends();
  });

  state.socket.on("message_notification", async (msg) => {
    if (!state.selectedFriend || msg.sender_id !== state.selectedFriend.id) {
      toast(`${msg.sender_username} stuurde een bericht.`, "info");
    }
    await loadFriends();
  });

  state.socket.on("snap_updated", async (msg) => {
    const inOpenChat = state.selectedFriend && (
      (msg.sender_id === state.selectedFriend.id && msg.receiver_id === state.user.id) ||
      (msg.sender_id === state.user.id && msg.receiver_id === state.selectedFriend.id)
    );
    if (inOpenChat) { updateMessageInState(msg); renderMessages(); }
    await loadFriends();
  });

  // ── Group messages ──────────────────────────────────────────────────────

  state.socket.on("new_group_message", async (msg) => {
    const inOpenGroup = state.selectedGroup && Number(msg.group_id) === state.selectedGroup.id;
    if (inOpenGroup) addOrUpdateMessage(msg);
    else toast(`${msg.group_name || "Groep"} - ${msg.sender_username}: ${messagePreview(msg)}`, "info");
    await loadGroups();
  });

  state.socket.on("group_message_deleted", async (data) => {
    if (state.selectedGroup && Number(data.group_id) === state.selectedGroup.id) {
      state.messages = state.messages.filter((m) => String(m.id) !== String(data.message_id));
      renderMessages();
    }
    await loadGroups();
  });

  // ── Social ──────────────────────────────────────────────────────────────

  state.socket.on("friend_request", async (req) => {
    toast(`${req.sender?.username || "Iemand"} wil vrienden worden.`, "success");
    await loadRequests();
  });

  state.socket.on("friends_updated", async () => {
    const { refreshSocialData } = await import("./sidebar.js");
    await refreshSocialData();
  });

  state.socket.on("groups_updated", async () => { await loadGroups(); });

  // ── Typing ──────────────────────────────────────────────────────────────

  state.socket.on("user_typing", (data) => {
    const el = document.getElementById("typing-indicator");
    if (el) el.textContent = `${data.username} typt...`;
  });

  state.socket.on("user_stop_typing", () => {
    const el = document.getElementById("typing-indicator");
    if (el) el.textContent = "";
  });

  state.socket.on("group_user_typing", (data) => {
    if (!state.selectedGroup || Number(data.group_id) !== state.selectedGroup.id) return;
    const el = document.getElementById("typing-indicator");
    if (el) el.textContent = `${data.username} typt...`;
  });

  state.socket.on("group_user_stop_typing", (data) => {
    if (!state.selectedGroup || Number(data.group_id) !== state.selectedGroup.id) return;
    const el = document.getElementById("typing-indicator");
    if (el) el.textContent = `${state.selectedGroup.member_count || 0} leden`;
  });

  // ── Calls ───────────────────────────────────────────────────────────────

  state.socket.on("incoming_call", showIncomingCall);
  state.socket.on("call_answered", handleCallAnswered);
  state.socket.on("call_declined", () => endCurrentCall("Gesprek geweigerd."));
  state.socket.on("call_ended", () => endCurrentCall("Gesprek beeindigd."));
  state.socket.on("call_unavailable", (data) => endCurrentCall(data?.message || "Gesprek niet beschikbaar."));
  state.socket.on("webrtc_offer", handleWebrtcOffer);
  state.socket.on("webrtc_answer", handleWebrtcAnswer);
  state.socket.on("webrtc_ice_candidate", handleRemoteCandidate);
}
