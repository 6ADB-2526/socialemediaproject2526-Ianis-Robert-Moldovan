/** @format */

import { state } from "./state.js";
import { api, toast } from "../utils/api.js";
import { escapeHtml, avatarMarkup } from "../utils/dom.js";
import { canUseMediaDevices, mediaUnavailableMessage, readMediaError, drawTextOnImage } from "../utils/media.js";
import { addOrUpdateMessage, renderHome } from "./chat.js";
import { loadStories } from "./sidebar.js";

export async function showCamera() {
  const main = document.getElementById("main-content");

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

  const cleanup = () => {
    stopCameraStream();
    document.body.classList.remove("chat-open");
    renderHome();
  };

  document.getElementById("camera-back-btn").addEventListener("click", cleanup);
  document.getElementById("camera-stop-btn").addEventListener("click", cleanup);

  if (!canUseMediaDevices()) {
    toast(mediaUnavailableMessage("camera"), "error");
    return;
  }

  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    document.getElementById("webcam").srcObject = state.cameraStream;
  } catch (err) {
    toast(readMediaError(err, "camera"), "error");
    return;
  }

  document.getElementById("capture-btn").addEventListener("click", captureSnap);
  document.getElementById("open-send-picker-btn").addEventListener("click", openSendPicker);
  document.getElementById("close-send-picker-btn").addEventListener("click", closeSendPicker);
  document.getElementById("snap-text-input").addEventListener("input", () => {
    const input = document.getElementById("snap-text-input");
    input?.classList.toggle("has-text", Boolean(input.value.trim()));
  });
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

function captureSnap() {
  const video = document.getElementById("webcam");
  const preview = document.getElementById("captured-preview");
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 720;
  canvas.height = video.videoHeight || 1280;
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  preview.dataset.baseImage = dataUrl;
  preview.src = dataUrl;
  preview.hidden = false;
  video.hidden = true;
  document.getElementById("snap-text-input").hidden = false;
  document.getElementById("camera-edit-actions").hidden = false;
  document.querySelector(".camera-container")?.classList.add("is-editing");
  setTimeout(() => document.getElementById("snap-text-input")?.focus(), 80);
}

async function getEditedSnapData() {
  const preview = document.getElementById("captured-preview");
  const textInput = document.getElementById("snap-text-input");
  const baseImage = preview?.dataset.baseImage || preview?.src;
  if (!baseImage) return "";
  const text = textInput?.value.trim() || "";
  return text ? drawTextOnImage(baseImage, text) : baseImage;
}

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

export async function sendSnapToFriend(friendId) {
  const imageData = await getEditedSnapData();
  if (!imageData) return;

  const friend = state.friends.find((f) => String(f.id) === String(friendId));
  if (!friend) { toast("Vriend niet gevonden.", "error"); return; }

  try {
    const data = await api("/messages/send", {
      method: "POST",
      body: JSON.stringify({ receiver_id: friend.id, is_snap: true, snap_data: imageData }),
    });
    stopCameraStream();
    const { openChat } = await import("./chat.js");
    await openChat(friend);
    addOrUpdateMessage(data.message);
  } catch (err) {
    toast(err.message, "error");
  }
}

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

  targets.querySelectorAll("[data-send-snap-friend]").forEach((btn) => {
    btn.addEventListener("click", () => sendSnapToFriend(btn.dataset.sendSnapFriend));
  });

  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add("active"));
}

function closeSendPicker() {
  const overlay = document.getElementById("send-to-overlay");
  if (!overlay) return;
  overlay.classList.remove("active");
  setTimeout(() => { overlay.hidden = true; }, 220);
}

export function stopCameraStream() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach((t) => t.stop());
    state.cameraStream = null;
  }
}
