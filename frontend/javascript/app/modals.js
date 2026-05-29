/** @format */

import { state } from "./state.js";
import { api, toast } from "../utils/api.js";
import { escapeHtml, avatarMarkup, createModal, openModal, closeModal } from "../utils/dom.js";
import { acceptRequest, rejectRequest, loadRequests, loadGroups } from "./sidebar.js";
import { openChat, openGroupChat } from "./chat.js";

export { createModal, openModal, closeModal };

export function createAndOpenModal(id, title, bodyHtml) {
  const modal = createModal(id, title, bodyHtml);
  openModal(modal);
  return modal;
}

// ── Add friend modal ──────────────────────────────────────────────────────

export function showAddFriendModal() {
  const modal = createModal("add-friend-modal", "Vrienden zoeken", `
    <div class="friend-search-box">
      <input id="friend-search-input" type="text" placeholder="Typ minstens 2 letters" />
      <div id="friend-search-results" class="friend-search-results"></div>
    </div>
    <div class="request-panel">
      <h4>Ontvangen verzoeken</h4>
      <div id="incoming-request-list"></div>
    </div>
    <div class="request-panel">
      <h4>Verstuurde verzoeken</h4>
      <div id="outgoing-request-list"></div>
    </div>
  `);

  openModal(modal);
  renderRequestLists(modal);

  const input = modal.querySelector("#friend-search-input");
  input.focus();
  input.addEventListener("input", () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => searchUsers(input.value, modal), 250);
  });
}

// ── Create group modal ────────────────────────────────────────────────────

export function showCreateGroupModal() {
  const friendOptions = state.friends.map((f) => `
    <label class="group-select-row">
      ${avatarMarkup(f, "compact-avatar")}
      <span>${escapeHtml(f.username)}</span>
      <input type="checkbox" name="group-friend" value="${f.id}" />
    </label>
  `).join("");

  const modal = createModal("create-group-modal", "Groep maken", `
    <form class="group-create-form" id="create-group-form">
      <input class="group-name-input" id="group-name-input" type="text" maxlength="80" placeholder="Groepsnaam (optioneel)" />
      <div>
        <p class="section-label">Kies minimaal 2 vrienden</p>
        <div class="group-select-list">
          ${friendOptions || `<p class="muted-text">Je hebt nog geen vrienden om toe te voegen.</p>`}
        </div>
      </div>
      <button class="primary-wide-btn" type="submit" ${state.friends.length < 2 ? "disabled" : ""}>Maak groep</button>
    </form>
  `);

  openModal(modal);
  modal.querySelector("#create-group-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const selectedIds = [...modal.querySelectorAll('input[name="group-friend"]:checked')].map((i) => Number(i.value));
    const name = modal.querySelector("#group-name-input")?.value.trim() || "";
    if (selectedIds.length < 2) { toast("Kies minimaal 2 vrienden voor een groepschat.", "error"); return; }
    try {
      const data = await api("/groups", { method: "POST", body: JSON.stringify({ name, member_ids: selectedIds }) });
      toast("Groep aangemaakt.", "success");
      closeModal(modal);
      await loadGroups();
      await openGroupChat(data.group);
    } catch (err) {
      toast(err.message, "error");
    }
  });
}

// ── Group info modal ──────────────────────────────────────────────────────

export function showGroupInfoModal(group) {
  const modal = createModal("group-info-modal", group.name, `
    <div class="group-members-list">
      ${(group.members || []).map((m) => `
        <div class="compact-user-row group-member-row">
          ${avatarMarkup(m, "compact-avatar")}
          <span>${escapeHtml(m.username)}</span>
          ${m.id === group.creator_id ? `<span class="status-pill">Maker</span>` : ""}
        </div>
      `).join("")}
    </div>
  `);
  openModal(modal);
}

// ── Request lists ─────────────────────────────────────────────────────────

export function renderRequestLists(root = document) {
  const incoming = root.querySelector("#incoming-request-list");
  const outgoing = root.querySelector("#outgoing-request-list");

  if (incoming) {
    incoming.innerHTML = state.incomingRequests.length
      ? state.incomingRequests.map((r) => `
          <div class="compact-user-row">
            ${avatarMarkup(r.sender, "compact-avatar")}
            <span>${escapeHtml(r.sender?.username || "Onbekend")}</span>
            <button class="mini-btn primary" type="button" data-accept-request="${r.id}">OK</button>
            <button class="mini-btn" type="button" data-reject-request="${r.id}">Nee</button>
          </div>
        `).join("")
      : `<p class="muted-text">Geen nieuwe verzoeken.</p>`;
  }

  if (outgoing) {
    outgoing.innerHTML = state.outgoingRequests.length
      ? state.outgoingRequests.map((r) => `
          <div class="compact-user-row">
            ${avatarMarkup(r.receiver, "compact-avatar")}
            <span>${escapeHtml(r.receiver?.username || "Onbekend")}</span>
            <span class="status-pill">Verstuurd</span>
          </div>
        `).join("")
      : `<p class="muted-text">Geen openstaande verzoeken.</p>`;
  }

  root.querySelectorAll("[data-accept-request]").forEach((btn) => {
    btn.addEventListener("click", async () => { await acceptRequest(btn.dataset.acceptRequest); renderRequestLists(root); });
  });
  root.querySelectorAll("[data-reject-request]").forEach((btn) => {
    btn.addEventListener("click", async () => { await rejectRequest(btn.dataset.rejectRequest); renderRequestLists(root); });
  });
}

// ── User search ───────────────────────────────────────────────────────────

async function searchUsers(query, root = document) {
  const results = root.querySelector("#friend-search-results");
  if (!results) return;
  const trimmed = query.trim();
  if (trimmed.length < 2) { results.innerHTML = `<p class="muted-text">Begin met zoeken...</p>`; return; }
  results.innerHTML = `<p class="muted-text">Zoeken...</p>`;
  try {
    const data = await api(`/users/search?q=${encodeURIComponent(trimmed)}`);
    renderSearchResults(data.users || [], results, root);
  } catch (err) {
    results.innerHTML = `<p class="muted-text">${escapeHtml(err.message)}</p>`;
  }
}

function renderSearchResults(users, container, root) {
  if (!users.length) { container.innerHTML = `<p class="muted-text">Geen users gevonden.</p>`; return; }

  container.innerHTML = users.map((u) => {
    const action = searchActionFor(u);
    return `
      <div class="compact-user-row">
        ${avatarMarkup(u, "compact-avatar")}
        <span>${escapeHtml(u.username)}</span>
        <button class="mini-btn ${action.primary ? "primary" : ""}" type="button"
          data-user-action="${action.action}" data-user-id="${u.id}" data-username="${escapeHtml(u.username)}"
          ${action.disabled ? "disabled" : ""}>${escapeHtml(action.label)}</button>
      </div>
    `;
  }).join("");

  container.querySelectorAll("[data-user-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.userAction;
      if (action === "add") await sendFriendRequest(btn.dataset.username, root);
      if (action === "chat") {
        const friend = state.friends.find((f) => String(f.id) === btn.dataset.userId);
        if (friend) { closeModal(document.getElementById("add-friend-modal")); openChat(friend); }
      }
      if (action === "accept") {
        const req = state.incomingRequests.find((r) => String(r.sender?.id) === btn.dataset.userId);
        if (req) await acceptRequest(req.id);
      }
    });
  });
}

function searchActionFor(user) {
  switch (user.relation_status) {
    case "friends": return { label: "Chat", action: "chat", primary: true };
    case "request_sent": return { label: "Verstuurd", action: "none", disabled: true };
    case "request_received": return { label: "Accepteer", action: "accept", primary: true };
    case "blocked": return { label: "Geblokkeerd", action: "none", disabled: true };
    default: return { label: "Verzoek", action: "add", primary: true };
  }
}

async function sendFriendRequest(username, root = document) {
  try {
    await api("/friends/add", { method: "POST", body: JSON.stringify({ username }) });
    toast("Vriendschapsverzoek verstuurd.", "success");
    await loadRequests();
    const modal = document.getElementById("add-friend-modal");
    if (modal) renderRequestLists(modal);
    const input = root.querySelector("#friend-search-input");
    if (input && modal) await searchUsers(input.value, modal);
  } catch (err) {
    toast(err.message, "error");
  }
}
