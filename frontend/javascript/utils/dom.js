/** @format */

// =============================================================================
// dom.js — hulpfuncties om HTML VEILIG te bouwen en te tonen: avatars, modals
// (pop-ups), en het formatteren van tijden.
// =============================================================================

// ── HTML escaping ─────────────────────────────────────────────────────────

// Maakt tekst veilig vóór ze in de HTML komt. Belangrijk tegen XSS-aanvallen:
// een gebruiker mag geen werkende code in een bericht kunnen stoppen. Truc:
// we zetten de tekst als 'textContent' en lezen de veilige innerHTML terug.
export function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

// ── Initials ──────────────────────────────────────────────────────────────

// Geeft de eerste letter (hoofdletter) van een naam terug, voor avatar-bolletjes.
export function initials(name = "?") {
  return name.trim().charAt(0).toUpperCase() || "?";
}

// ── Avatar markup ─────────────────────────────────────────────────────────

// Bouwt de HTML voor één avatar-afbeelding (van een gebruiker).
export function avatarMarkup(user, className = "friend-avatar-img") {
  const src = user?.avatar || "";
  return `<img src="${escapeHtml(src)}" alt="" class="${className}" />`;
}

// Bouwt een 'samengestelde' groeps-avatar uit de initialen van enkele leden.
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

// Verberg een pop-up (modal).
export function closeModal(modal) {
  if (modal) modal.hidden = true;
}

// Toon een pop-up (modal).
export function openModal(modal) {
  if (modal) modal.hidden = false;
}

/**
 * createModal() — maakt (of vervangt de inhoud van) een pop-up met een vaste
 * vorm: een titel, een sluitknop (×), en de meegegeven inhoud.
 * Klikken op de achtergrond of op × sluit de pop-up.
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

  // Sluitknop en klik-op-achtergrond koppelen.
  modal.querySelector("[data-close-modal]").addEventListener("click", () => closeModal(modal));
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(modal); });
  return modal;
}

// ── Time formatting ───────────────────────────────────────────────────────

// Zet een server-tijd (tekst) om naar een tijdstip in milliseconden.
// Voegt een 'Z' toe als er geen tijdzone in zit, zodat het als UTC gelezen wordt.
export function parseServerTime(value) {
  if (!value) return null;
  const raw = String(value);
  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const ts = new Date(hasTimezone ? raw : `${raw}Z`).getTime();
  return Number.isNaN(ts) ? null : ts;
}

// Maakt van een tijd een korte tekst zoals 'just now', '5 min', '2 uur', '3 d'.
export function formatRelativeTime(value) {
  if (!value) return "";
  const ts = parseServerTime(value);
  if (ts === null) return "";
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000)); // verschil in seconden

  if (diff < 20) return "just now";
  if (diff < 60) return `${Math.floor(diff / 20) * 20} sec`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} uur`;
  return `${Math.floor(hrs / 24)} d`;
}

// Variant voor verzonden berichten: 'Sent just now' / 'Sent 5 min ago'.
export function formatSentAge(value) {
  const rel = formatRelativeTime(value);
  return rel === "just now" ? "Sent just now" : `Sent ${rel} ago`;
}

// Werkt alle tijd-labels op het scherm bij. Wordt periodiek aangeroepen zodat
// '2 min' vanzelf '3 min' wordt zonder de pagina te verversen.
export function updateRelativeLabels() {
  document.querySelectorAll("[data-relative-time]").forEach((el) => {
    el.textContent = formatRelativeTime(el.dataset.relativeTime);
  });
  document.querySelectorAll("[data-sent-time]").forEach((el) => {
    el.textContent = formatSentAge(el.dataset.sentTime);
  });
}

// ── Misc ──────────────────────────────────────────────────────────────────

// Scrollt het berichtenvenster helemaal naar beneden (naar het nieuwste bericht).
export function scrollMessagesToBottom() {
  const el = document.getElementById("chat-messages");
  if (el) el.scrollTop = el.scrollHeight;
}

// Zet een opgenomen bestand (foto/audio = 'blob') om naar een data-URL (tekst),
// zodat het als JSON naar de server gestuurd en opgeslagen kan worden.
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
