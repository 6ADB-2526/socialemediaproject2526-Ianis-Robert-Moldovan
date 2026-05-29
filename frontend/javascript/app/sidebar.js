/** @format */

import { state } from "./state.js";
import { api, toast } from "../utils/api.js";
import { escapeHtml, initials, avatarMarkup, groupAvatarMarkup, updateRelativeLabels } from "../utils/dom.js";

// ── Message preview helpers ───────────────────────────────────────────────

export function messagePreview(msg) {
  if (!msg) return "Nog geen berichten";
  if (msg.is_voice) return "Spraakbericht";
  if (msg.is_snap) return "Snap";
  return msg.text || "Bericht";
}

export function groupPreview(group) {
  if (!group?.last_message) return `${group?.member_count || 0} leden`;
  const sender = group.last_message.sender_id === state.user?.id ? "Jij" : group.last_message.sender_username;
  return `${sender}: ${messagePreview(group.last_message)}`;
}

// ── Data loaders ──────────────────────────────────────────────────────────

export async function loadFriends() {
  const data = await api("/friends");
  state.friends = data.friends || [];
  renderFriendsList();
}

export async function loadGroups() {
  const data = await api("/groups");
  state.groups = data.groups || [];
  renderFriendsList();
}

export async function loadRequests() {
  const data = await api("/friends/requests");
  state.incomingRequests = data.incoming || data.requests || [];
  state.outgoingRequests = data.outgoing || [];
  renderFriendsList();
}

export async function loadBlockedUsers() {
  const data = await api("/blocked");
  state.blockedUsers = data.blocked || [];
}

export async function loadStories() {
  try {
    const data = await api("/stories");
    state.stories = data.stories || [];
  } catch {
    state.stories = [];
  }
  renderStories();
}

export async function refreshSocialData() {
  await Promise.all([loadFriends(), loadGroups(), loadRequests(), loadBlockedUsers(), loadStories()]);
}

// ── Request actions ───────────────────────────────────────────────────────

export async function acceptRequest(requestId) {
  try {
    await api(`/friends/requests/${requestId}/accept`, { method: "POST" });
    toast("Verzoek geaccepteerd.", "success");
    await refreshSocialData();
  } catch (err) {
    toast(err.message, "error");
  }
}

export async function rejectRequest(requestId) {
  try {
    await api(`/friends/requests/${requestId}/reject`, { method: "POST" });
    toast("Verzoek geweigerd.", "success");
    await loadRequests();
  } catch (err) {
    toast(err.message, "error");
  }
}

// ── Stories ───────────────────────────────────────────────────────────────

export function renderStories() {
  const container = document.getElementById("stories-container");
  if (!container) return;

  if (!state.stories.length) {
    container.innerHTML = `<div class="empty-state small">Nog geen stories</div>`;
    return;
  }

  container.innerHTML = `
    <div class="story-row">
      ${state.stories.map((g) => `
        <button class="story-pill" type="button" data-story-user="${g.user_id}">
          ${avatarMarkup(g, "story-avatar")}
          <span>${escapeHtml(g.username)}</span>
        </button>
      `).join("")}
    </div>
  `;

  container.querySelectorAll("[data-story-user]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const group = state.stories.find((s) => String(s.user_id) === btn.dataset.storyUser);
      if (group) showStoryViewer(group);
    });
  });
}

function showStoryViewer(storyGroup) {
  import("./modals.js").then(({ createAndOpenModal }) => {
    const first = storyGroup.stories?.[0];
    if (!first) return;
    createAndOpenModal("story-modal", storyGroup.username, `
      <div class="story-viewer"><img src="${escapeHtml(first.image_data)}" alt="" /></div>
    `);
  });
}

// ── Friends list ──────────────────────────────────────────────────────────

export function renderFriendsList() {
  const container = document.getElementById("friends-list");
  if (!container) return;

  const requestHtml = state.incomingRequests.map((r) => `
    <article class="request-item">
      <div class="friend-avatar-container">${avatarMarkup(r.sender)}</div>
      <div class="friend-info">
        <span class="friend-name">${escapeHtml(r.sender?.username || "Onbekend")}</span>
        <span class="friend-subtext">Wil vrienden worden</span>
      </div>
      <div class="request-actions">
        <button class="mini-btn primary" type="button" data-accept-request="${r.id}">OK</button>
        <button class="mini-btn" type="button" data-reject-request="${r.id}">Nee</button>
      </div>
    </article>
  `).join("");

  const groupsHtml = state.groups.map((g) => {
    const active = state.selectedGroup?.id === g.id ? "active-chat" : "";
    return `
      <article class="friend-item group-item ${active}" data-group-id="${g.id}">
        <div class="friend-avatar-container">${groupAvatarMarkup(g, state.user?.id)}</div>
        <div class="friend-info">
          <span class="friend-name">${escapeHtml(g.name)}</span>
          <span class="friend-subtext">
            ${escapeHtml(groupPreview(g))}
            ${g.last_message ? `<span class="friend-time">- <span data-relative-time="${g.last_message.created_at}"></span></span>` : ""}
          </span>
        </div>
        ${g.unread_count ? `<span class="unread-badge">${g.unread_count}</span>` : ""}
      </article>
    `;
  }).join("");

  const friendsHtml = state.friends.map((f) => {
    const active = state.selectedFriend?.id === f.id ? "active-chat" : "";
    return `
      <article class="friend-item ${active}" data-friend-id="${f.id}">
        <div class="friend-avatar-container">${avatarMarkup(f)}</div>
        <div class="friend-info">
          <span class="friend-name">${escapeHtml(f.username)}</span>
          <span class="friend-subtext">
            ${escapeHtml(messagePreview(f.last_message))}
            ${f.last_message ? `<span class="friend-time">- <span data-relative-time="${f.last_message.created_at}"></span></span>` : ""}
          </span>
        </div>
        ${f.unread_count ? `<span class="unread-badge">${f.unread_count}</span>` : ""}
      </article>
    `;
  }).join("");

  const emptyHtml = `<div class="empty-state">Zoek vrienden met de plus-knop of maak een groep.</div>`;
  container.innerHTML = `${requestHtml}${groupsHtml}${friendsHtml || (!groupsHtml ? emptyHtml : "")}`;

  // Event delegation
  container.querySelectorAll("[data-group-id]").forEach((el) => {
    el.addEventListener("click", () => {
      const group = state.groups.find((g) => String(g.id) === el.dataset.groupId);
      if (group) import("./chat.js").then(({ openGroupChat }) => openGroupChat(group));
    });
  });

  container.querySelectorAll("[data-friend-id]").forEach((el) => {
    el.addEventListener("click", () => {
      const friend = state.friends.find((f) => String(f.id) === el.dataset.friendId);
      if (friend) import("./chat.js").then(({ openChat }) => openChat(friend));
    });
  });

  container.querySelectorAll("[data-accept-request]").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); acceptRequest(btn.dataset.acceptRequest); });
  });

  container.querySelectorAll("[data-reject-request]").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); rejectRequest(btn.dataset.rejectRequest); });
  });

  updateRelativeLabels();
}

// ── Sidebar search ────────────────────────────────────────────────────────

export function setupSidebarSearch() {
  const input = document.getElementById("sidebar-search");
  if (!input) return;

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { renderFriendsList(); return; }

    const prevGroups = state.groups;
    const prevFriends = state.friends;
    state.groups = state.groups.filter((g) => g.name.toLowerCase().includes(q));
    state.friends = state.friends.filter((f) => f.username.toLowerCase().includes(q));
    renderFriendsList();
    state.groups = prevGroups;
    state.friends = prevFriends;
  });
}
