/** @format */

import { API_BASE } from "./config.js";

/**
 * Typed fetch wrapper.  Throws an Error (with .message from the server) on
 * non-2xx responses so callers can catch cleanly.
 *
 * @param {string} path      - API path, e.g. "/me"
 * @param {RequestInit} opts - Standard fetch options
 * @returns {Promise<any>}   - Parsed JSON body
 */
export async function api(path, opts = {}) {
  const headers = new Headers(opts.headers || {});
  const hasBody = Object.prototype.hasOwnProperty.call(opts, "body");

  if (hasBody && !(opts.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE}${path}`, { credentials: "include", ...opts, headers });
  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json() : {};

  if (!res.ok) throw new Error(data.error || "Er ging iets mis.");
  return data;
}

// ── Toast notifications ───────────────────────────────────────────────────

/**
 * Show a transient toast message.
 * @param {string} message
 * @param {"info"|"success"|"error"} type
 */
export function toast(message, type = "info") {
  let el = document.querySelector(".app-toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "app-toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.dataset.type = type;
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), 2800);
}
