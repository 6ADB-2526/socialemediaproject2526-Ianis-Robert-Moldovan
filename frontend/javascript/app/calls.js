/** @format */

// Simpele fake call functie
// Geen echte audio/video meer

import { state, resetCall } from "./state.js";

// Start gesprek
export async function startCall(type) {
  // Stop als niemand geselecteerd is
  if (!state.selectedFriend) return;

  // Save call info
  state.call.active = true;
  state.call.type = type;

  // Toon popup
  showCallPopup(
    `${type === "video" ? "Video" : "Audio"} gesprek`,
    `Je belt met ${state.selectedFriend.username}`
  );
}

// Inkomende oproep
export function showIncomingCall(data) {
  state.call.active = true;

  showCallPopup(
    "Inkomend gesprek",
    `${data.caller?.username || "Iemand"} belt je`
  );
}

// Popup maken
function showCallPopup(title, text) {
  // Verwijder oude popup
  document.getElementById("call-popup")?.remove();

  // Nieuwe popup
  const popup = document.createElement("div");

  popup.id = "call-popup";

  // Simpele styling
  popup.style.position = "fixed";
  popup.style.top = "20px";
  popup.style.right = "20px";
  popup.style.background = "#222";
  popup.style.color = "white";
  popup.style.padding = "20px";
  popup.style.borderRadius = "10px";
  popup.style.zIndex = "9999";

  // HTML inhoud
  popup.innerHTML = `
    <h3>${title}</h3>
    <p>${text}</p>

    <button id="hangup-btn">
      Ophangen
    </button>
  `;

  // Voeg toe aan pagina
  document.body.appendChild(popup);

  // Ophangen knop
  document
    .getElementById("hangup-btn")
    ?.addEventListener("click", endCurrentCall);
}

// Gesprek stoppen
export function endCurrentCall() {
  // Verwijder popup
  document.getElementById("call-popup")?.remove();

  // Reset state
  resetCall();
}

/*
  BELANGRIJK:
  Deze functies MOETEN blijven bestaan.
  Andere bestanden gebruiken ze nog.
  Daarom laten we ze leeg.
*/

export async function handleCallAnswered() {}

export async function handleWebrtcOffer() {}

export async function handleWebrtcAnswer() {}

export async function handleRemoteCandidate() {}

export function toggleMute() {}

export function toggleCamera() {}

export function cleanupCall() {}
