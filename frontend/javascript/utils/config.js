/** @format */

// =============================================================================
// config.js — bepaalt OP WELK ADRES de backend draait.
// De frontend kan op een ander adres/poort draaien dan de backend, dus moeten
// we uitrekenen waar we de API kunnen bereiken (bv. http://127.0.0.1:5000).
// =============================================================================

// Zet een waarde om naar een "origin" (protocol + host + poort), of "" als ongeldig.
function normalizeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

// Lees een eerder bewaarde backend-URL uit localStorage (browsergeheugen).
function getStoredBackendOrigin() {
  try {
    return localStorage.getItem("snap_backend_origin") || "";
  } catch {
    return "";
  }
}

// Bewaar een backend-URL in localStorage voor de volgende keer.
function setStoredBackendOrigin(value) {
  try {
    localStorage.setItem("snap_backend_origin", value);
  } catch {}
}

// BACKEND_ORIGIN wordt één keer berekend wanneer dit bestand laadt.
// Volgorde: een ?server=... in de URL of een bewaarde waarde > slim raden.
export const BACKEND_ORIGIN = (() => {
  const { protocol, hostname, port, origin } = window.location;
  const serverFromUrl = new URLSearchParams(window.location.search).get("server");
  const configured = normalizeOrigin(serverFromUrl || getStoredBackendOrigin());

  if (configured) {
    setStoredBackendOrigin(configured);
    return configured;
  }

  // Geopend als bestand (file://)? Dan lokaal op poort 5000.
  if (protocol === "file:") return "http://127.0.0.1:5000";
  // Draait de frontend op een dev-server (5500/5173/3000)? Backend op 5000.
  if (["5500", "5173", "3000"].includes(port)) {
    return `http://${hostname || "127.0.0.1"}:5000`;
  }
  // Anders: zelfde adres als de pagina (frontend en backend op dezelfde server).
  return origin;
})();

// Het basis-pad voor alle API-aanroepen, bv. http://127.0.0.1:5000/api
export const API_BASE = `${BACKEND_ORIGIN}/api`;
