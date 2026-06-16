/** @format */

// =============================================================================
// camera.js — de CAMERA: een foto (snap) maken, er tekst op zetten, en hem
// versturen naar een vriend of als story plaatsen.
// =============================================================================

import { state } from "./state.js";
import { api, toast } from "../utils/api.js";
import { escapeHtml, avatarMarkup } from "../utils/dom.js";
import { canUseMediaDevices, mediaUnavailableMessage, readMediaError, drawTextOnImage } from "../utils/media.js";
import { addOrUpdateMessage, renderHome } from "./chat.js";
import { loadStories } from "./sidebar.js";

// Opent het camerascherm: tekent de UI, start de webcam en koppelt de knoppen.
export async function showCamera() {
  const main = document.getElementById("main-content");

  // De camera-UI: een live videobeeld, een vastlegknop, en (na het maken van
  // een foto) een tekstveld + verzendkeuze. De preview/tekst zijn eerst verborgen.
  main.innerHTML = `
    <section class="camera-view-wrapper">
      <header class="chat-header">
        <button class="mobile-back-btn" id="camera-back-btn" type="button">Terug</button>
        <div class="chat-name">Camera</div>
        <button class="icon-btn" id="camera-stop-btn" type="button">Sluit</button>
      </header>
      <div class="camera-stage">
        <div class="camera-container">
          <video id="webcam" autoplay playsinline muted></video>
          <img id="captured-preview" class="captured-preview" alt="" hidden />
          <input id="snap-text-input" class="snap-text-input" type="text" maxlength="80" placeholder="Aa" hidden />
          <div class="camera-ui">
            <button class="capture-btn" id="capture-btn" type="button" title="Maak snap"></button>
          </div>
          <div class="camera-edit-actions" id="camera-edit-actions" hidden>
            <button class="camera-tool-btn" id="retake-btn" type="button">Opnieuw</button>
            <button class="camera-send-arrow" id="open-send-picker-btn" type="button" title="Versturen">&rarr;</button>
          </div>
          <div class="send-to-overlay" id="send-to-overlay" hidden>
            <div class="send-to-header">
              <strong>Stuur naar</strong>
              <button class="modal-close compact-close" id="close-send-picker-btn" type="button">x</button>
            </div>
            <button class="selection-item story-selection" id="story-send-btn" type="button">
              <span class="selection-left">
                <span class="selection-icon">+</span>
                <span>Mijn verhaal</span>
              </span>
              <span>&rarr;</span>
            </button>
            <div id="snap-friend-targets" class="snap-friend-targets"></div>
          </div>
        </div>
      </div>
    </section>
  `;

  document.body.classList.add("chat-open");

  // Opruimen: camera uitzetten en terug naar het beginscherm.
  const cleanup = () => {
    stopCameraStream();
    document.body.classList.remove("chat-open");
    renderHome();
  };

  document.getElementById("camera-back-btn").addEventListener("click", cleanup);
  document.getElementById("camera-stop-btn").addEventListener("click", cleanup);

  // Camera niet beschikbaar (bv. geen HTTPS)? Toon een uitleg en stop.
  if (!canUseMediaDevices()) {
    toast(mediaUnavailableMessage("camera"), "error");
    return;
  }

  // Vraag toegang tot de camera en toon het livebeeld in het <video>-element.
  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    document.getElementById("webcam").srcObject = state.cameraStream;
  } catch (err) {
    toast(readMediaError(err, "camera"), "error");
    return;
  }

  // Knoppen koppelen.
  document.getElementById("capture-btn").addEventListener("click", captureSnap);
  document.getElementById("open-send-picker-btn").addEventListener("click", openSendPicker);
  document.getElementById("close-send-picker-btn").addEventListener("click", closeSendPicker);
  // Markeer het tekstveld als 'heeft tekst' (voor styling) zodra je iets typt.
  document.getElementById("snap-text-input").addEventListener("input", () => {
    const input = document.getElementById("snap-text-input");
    input?.classList.toggle("has-text", Boolean(input.value.trim()));
  });
  // 'Opnieuw': verberg de foto en toon weer het livebeeld.
  document.getElementById("retake-btn").addEventListener("click", () => {
    closeSendPicker();
    document.getElementById("captured-preview").hidden = true;
    document.getElementById("webcam").hidden = false;
    document.getElementById("snap-text-input").hidden = true;
    document.getElementById("snap-text-input").value = "";
    document.getElementById("camera-edit-actions").hidden = true;
    document.querySelector(".camera-container")?.classList.remove("is-editing");
  });
  document.getElementById("story-send-btn").addEventListener("click", sendStory);
}

// Maakt een foto van het livebeeld via een (onzichtbaar) canvas.
function captureSnap() {
  const video = document.getElementById("webcam");
  const preview = document.getElementById("captured-preview");
  // Teken het huidige videobeeld op een canvas en zet dat om naar een afbeelding.
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 720;
  canvas.height = video.videoHeight || 1280;
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

  // Bewaar de 'kale' foto apart (baseImage), zodat we de tekst later opnieuw
  // kunnen tekenen zonder kwaliteitsverlies door stapelen.
  preview.dataset.baseImage = dataUrl;
  preview.src = dataUrl;
  preview.hidden = false;
  video.hidden = true;   // livebeeld verbergen, foto tonen
  document.getElementById("snap-text-input").hidden = false;
  document.getElementById("camera-edit-actions").hidden = false;
  document.querySelector(".camera-container")?.classList.add("is-editing");
  setTimeout(() => document.getElementById("snap-text-input")?.focus(), 80);
}

// Geeft de uiteindelijke foto terug: met tekst erop (indien getypt), anders kaal.
async function getEditedSnapData() {
  const preview = document.getElementById("captured-preview");
  const textInput = document.getElementById("snap-text-input");
  const baseImage = preview?.dataset.baseImage || preview?.src;
  if (!baseImage) return "";
  const text = textInput?.value.trim() || "";
  // drawTextOnImage (uit media.js) brandt de tekst in de foto.
  return text ? drawTextOnImage(baseImage, text) : baseImage;
}

// Plaatst de gemaakte foto als story (24u zichtbaar).
async function sendStory() {
  const imageData = await getEditedSnapData();
  if (!imageData) return;
  try {
    await api("/stories/add", { method: "POST", body: JSON.stringify({ image_data: imageData }) });
    toast("Story geplaatst.", "success");
    stopCameraStream();
    await loadStories();
    document.body.classList.remove("chat-open");
    renderHome();
  } catch (err) {
    toast(err.message, "error");
  }
}

// Verstuurt de gemaakte foto als snap naar een specifieke vriend.
export async function sendSnapToFriend(friendId) {
  const imageData = await getEditedSnapData();
  if (!imageData) return;

  const friend = state.friends.find((f) => String(f.id) === String(friendId));
  if (!friend) { toast("Vriend niet gevonden.", "error"); return; }

  try {
    // is_snap: true zorgt dat de server dit als verdwijnende snap behandelt.
    const data = await api("/messages/send", {
      method: "POST",
      body: JSON.stringify({ receiver_id: friend.id, is_snap: true, snap_data: imageData }),
    });
    stopCameraStream();
    // Open meteen de chat met die vriend en toon de verstuurde snap.
    const { openChat } = await import("./chat.js");
    await openChat(friend);
    addOrUpdateMessage(data.message);
  } catch (err) {
    toast(err.message, "error");
  }
}

// Opent het keuzemenu 'Stuur naar': vult het met je vriendenlijst.
function openSendPicker() {
  const overlay = document.getElementById("send-to-overlay");
  const targets = document.getElementById("snap-friend-targets");
  if (!overlay || !targets) return;

  targets.innerHTML = state.friends.length
    ? state.friends.map((f) => `
        <button class="selection-item" type="button" data-send-snap-friend="${f.id}">
          <span class="selection-left">
            ${avatarMarkup(f, "selection-avatar-img")}
            <span>${escapeHtml(f.username)}</span>
          </span>
          <span>&rarr;</span>
        </button>
      `).join("")
    : `<p class="muted-text send-empty">Geen vrienden om naar te sturen.</p>`;

  // Klik op een vriend -> stuur de snap naar die persoon.
  targets.querySelectorAll("[data-send-snap-friend]").forEach((btn) => {
    btn.addEventListener("click", () => sendSnapToFriend(btn.dataset.sendSnapFriend));
  });

  // Tonen + animatie starten (requestAnimationFrame zorgt voor een vloeiende fade-in).
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add("active"));
}

// Sluit het 'Stuur naar'-menu (met een korte uitfade van 220ms).
function closeSendPicker() {
  const overlay = document.getElementById("send-to-overlay");
  if (!overlay) return;
  overlay.classList.remove("active");
  setTimeout(() => { overlay.hidden = true; }, 220);
}

// Zet de camera helemaal uit en geeft het toestel vrij (anders blijft het lampje aan).
export function stopCameraStream() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach((t) => t.stop());
    state.cameraStream = null;
  }
}
