/** @format */

// =============================================================================
// calls.js — het bel-systeem aan de browserkant.
// LET OP: dit is een VEREENVOUDIGDE versie ("fake call"). Er is geen echte
// audio/video meer; er verschijnt enkel een belpop-up. De echte WebRTC-functies
// staan onderaan en zijn bewust LEEG gelaten, zodat andere bestanden ze nog
// kunnen importeren zonder te crashen.
// =============================================================================

import { state, resetCall } from "./state.js";

// Start een (uitgaand) gesprek: toont gewoon een pop-up.
export async function startCall(type) {
  // Niets doen als er geen vriend geselecteerd is.
  if (!state.selectedFriend) return;

  // Onthoud dat er een gesprek bezig is.
  state.call.active = true;
  state.call.type = type;

  // Toon de belpop-up.
  showCallPopup(
    `${type === "video" ? "Video" : "Audio"} gesprek`,
    `Je belt met ${state.selectedFriend.username}`
  );
}

// Toont een pop-up bij een inkomende oproep.
export function showIncomingCall(data) {
  state.call.active = true;

  showCallPopup(
    "Inkomend gesprek",
    `${data.caller?.username || "Iemand"} belt je`
  );
}

// Bouwt de belpop-up (een eenvoudig venster rechtsboven met een 'Ophangen'-knop).
function showCallPopup(title, text) {
  // Verwijder een eventuele oude pop-up eerst.
  document.getElementById("call-popup")?.remove();

  // Maak een nieuwe pop-up.
  const popup = document.createElement("div");
  popup.id = "call-popup";

  // Eenvoudige styling rechtstreeks in JS.
  popup.style.position = "fixed";
  popup.style.top = "20px";
  popup.style.right = "20px";
  popup.style.background = "#222";
  popup.style.color = "white";
  popup.style.padding = "20px";
  popup.style.borderRadius = "10px";
  popup.style.zIndex = "9999";

  // De inhoud van de pop-up.
  popup.innerHTML = `
    <h3>${title}</h3>
    <p>${text}</p>

    <button id="hangup-btn">
      Ophangen
    </button>
  `;

  // Voeg toe aan de pagina.
  document.body.appendChild(popup);

  // Koppel de ophangknop.
  document
    .getElementById("hangup-btn")
    ?.addEventListener("click", endCurrentCall);
}

// Beëindig het gesprek: verwijder de pop-up en reset de bel-toestand.
export function endCurrentCall() {
  document.getElementById("call-popup")?.remove();
  resetCall();
}

/*
  BELANGRIJK:
  De functies hieronder MOETEN blijven bestaan, want socket.js en chat.js
  importeren ze. In deze 'fake call'-versie doen ze niets, maar door ze te
  laten bestaan voorkom je import-fouten in de rest van de app.
*/

export async function handleCallAnswered() {}

export async function handleWebrtcOffer() {}

export async function handleWebrtcAnswer() {}

export async function handleRemoteCandidate() {}

export function toggleMute() {}

export function toggleCamera() {}

export function cleanupCall() {}
