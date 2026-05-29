/** @format */

// ── Backend origin resolution ─────────────────────────────────────────────

function normalizeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function getStoredBackendOrigin() {
  try {
    return localStorage.getItem("snap_backend_origin") || "";
  } catch {
    return "";
  }
}

function setStoredBackendOrigin(value) {
  try {
    localStorage.setItem("snap_backend_origin", value);
  } catch {}
}

export const BACKEND_ORIGIN = (() => {
  const { protocol, hostname, port, origin } = window.location;
  const serverFromUrl = new URLSearchParams(window.location.search).get("server");
  const configured = normalizeOrigin(serverFromUrl || getStoredBackendOrigin());

  if (configured) {
    setStoredBackendOrigin(configured);
    return configured;
  }

  if (protocol === "file:") return "http://127.0.0.1:5000";
  if (["5500", "5173", "3000"].includes(port)) {
    return `http://${hostname || "127.0.0.1"}:5000`;
  }
  return origin;
})();

export const API_BASE = `${BACKEND_ORIGIN}/api`;
