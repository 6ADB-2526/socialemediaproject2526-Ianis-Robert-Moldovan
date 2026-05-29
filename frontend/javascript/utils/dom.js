/** @format */

// ── HTML escaping ─────────────────────────────────────────────────────────

export function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

// ── Initials ──────────────────────────────────────────────────────────────

export function initials(name = "?") {
  return name.trim().charAt(0).toUpperCase() || "?";
}

// ── Avatar markup ─────────────────────────────────────────────────────────

export function avatarMarkup(user, className = "friend-avatar-img") {
  const src = user?.avatar || "";
  return `<img src="${escapeHtml(src)}" alt="" class="${className}" />`;
}

export function groupAvatarMarkup(group, currentUserId, className = "group-avatar") {
  const members = (group?.members || []).filter((m) => m.id !== currentUserId);
  const shown = (members.length ? members : group?.members || []).slice(0, 4);
  const cells = shown.length ? shown : [{ username: group?.name || "Groep" }];

  return `
    <div class="${className}">
      ${cells.map((m) => `<span class="group-avatar-initial">${escapeHtml(initials(m.username || group?.name || "G"))}</span>`).join("")}
    </div>
  `;
}

// ── Modal helpers ─────────────────────────────────────────────────────────

export function closeModal(modal) {
  if (modal) modal.hidden = true;
}

export function openModal(modal) {
  if (modal) modal.hidden = false;
}

/**
 * Create (or replace the content of) a modal with a standard shell.
 * Clicking the backdrop or the × button closes it.
 */
export function createModal(id, title, bodyHtml) {
  let modal = document.getElementById(id);
  if (!modal) {
    modal = document.createElement("div");
    modal.id = id;
    modal.className = "modal-backdrop";
    modal.hidden = true;
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <section class="modal-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <button class="modal-close" data-close-modal type="button">x</button>
      <h3>${escapeHtml(title)}</h3>
      ${bodyHtml}
    </section>
  `;

  modal.querySelector("[data-close-modal]").addEventListener("click", () => closeModal(modal));
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(modal); });
  return modal;
}

// ── Time formatting ───────────────────────────────────────────────────────

export function parseServerTime(value) {
  if (!value) return null;
  const raw = String(value);
  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const ts = new Date(hasTimezone ? raw : `${raw}Z`).getTime();
  return Number.isNaN(ts) ? null : ts;
}

export function formatRelativeTime(value) {
  if (!value) return "";
  const ts = parseServerTime(value);
  if (ts === null) return "";
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));

  if (diff < 20) return "just now";
  if (diff < 60) return `${Math.floor(diff / 20) * 20} sec`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} uur`;
  return `${Math.floor(hrs / 24)} d`;
}

export function formatSentAge(value) {
  const rel = formatRelativeTime(value);
  return rel === "just now" ? "Sent just now" : `Sent ${rel} ago`;
}

export function updateRelativeLabels() {
  document.querySelectorAll("[data-relative-time]").forEach((el) => {
    el.textContent = formatRelativeTime(el.dataset.relativeTime);
  });
  document.querySelectorAll("[data-sent-time]").forEach((el) => {
    el.textContent = formatSentAge(el.dataset.sentTime);
  });
}

// ── Misc ──────────────────────────────────────────────────────────────────

export function scrollMessagesToBottom() {
  const el = document.getElementById("chat-messages");
  if (el) el.scrollTop = el.scrollHeight;
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
