/** @format */

// =============================================================================
// api.js — DE centrale manier om met de backend te praten + meldingen (toasts).
// Bijna elk frontend-bestand gebruikt deze twee functies.
// =============================================================================

import { API_BASE } from "./config.js";

/**
 * api() — een nette verpakking rond fetch().
 * Doet automatisch: juiste headers zetten, cookies meesturen (voor de login),
 * JSON omzetten, en een Error gooien bij een mislukte aanvraag (zodat de
 * aanroeper het met try/catch netjes kan opvangen).
 *
 * @param {string} path      - API-pad, bv. "/me"
 * @param {RequestInit} opts - Standaard fetch-opties (method, body, ...)
 * @returns {Promise<any>}   - De JSON die de server terugstuurt
 */
export async function api(path, opts = {}) {
  const headers = new Headers(opts.headers || {});
  const hasBody = Object.prototype.hasOwnProperty.call(opts, "body");

  // Als er data meegestuurd wordt (en het geen bestand-upload is), zeg dan dat het JSON is.
  if (hasBody && !(opts.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // credentials: "include" = stuur de sessie-cookie mee (anders weet de server niet wie je bent).
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include", ...opts, headers });
  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json() : {};

  // Bij een foutcode (niet 2xx): gooi een Error met de foutmelding van de server.
  if (!res.ok) throw new Error(data.error || "Er ging iets mis.");
  return data;
}

// ── Toast notifications ───────────────────────────────────────────────────

/**
 * toast() — toont kort een melding onderaan het scherm.
 * @param {string} message - de tekst
 * @param {"info"|"success"|"error"} type - bepaalt de kleur/stijl
 */
export function toast(message, type = "info") {
  // Hergebruik het bestaande toast-element, of maak er één aan.
  let el = document.querySelector(".app-toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "app-toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.dataset.type = type;
  el.classList.add("show");
  // Verberg de melding na 2,8 seconden (vorige timer eerst wissen).
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), 2800);
}
