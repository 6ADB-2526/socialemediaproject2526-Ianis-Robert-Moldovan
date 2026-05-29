/** @format */

// ── Media device guards ───────────────────────────────────────────────────

export function canUseMediaDevices() {
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

export function mediaUnavailableMessage(deviceName) {
  if (!window.isSecureContext) {
    return `${deviceName} werkt alleen via localhost of een HTTPS-link. Gebruik je tunnel-URL.`;
  }
  return `Je browser ondersteunt geen ${deviceName}toegang.`;
}

export function readMediaError(error, deviceName) {
  if (error?.name === "NotAllowedError") {
    return `Geef toestemming voor je ${deviceName} en probeer opnieuw.`;
  }
  if (error?.name === "NotFoundError") {
    return `Geen ${deviceName} gevonden op dit apparaat.`;
  }
  return `${deviceName} kon niet gestart worden. Gebruik localhost of een HTTPS-link.`;
}

// ── Audio MIME type ───────────────────────────────────────────────────────

export function getSupportedAudioMimeType() {
  if (!window.MediaRecorder) return "";
  return (
    ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) || ""
  );
}

// ── Canvas / snap text overlay ────────────────────────────────────────────

function wrapCanvasText(ctx, text, maxWidth, font) {
  ctx.font = font;
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !current) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
}

export function drawTextOnImage(imageData, text) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const fontSize = Math.max(34, Math.round(canvas.width * 0.075));
      const maxWidth = canvas.width * 0.82;
      const lines = wrapCanvasText(ctx, text, maxWidth, `${fontSize}px Arial`);
      const lineHeight = fontSize * 1.18;
      const yStart = canvas.height * 0.44 - (lines.length * lineHeight) / 2;

      ctx.font = `800 ${fontSize}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";

      lines.forEach((line, i) => {
        const y = yStart + i * lineHeight + lineHeight / 2;
        ctx.lineWidth = Math.max(8, fontSize * 0.18);
        ctx.strokeStyle = "rgba(0,0,0,0.7)";
        ctx.strokeText(line, canvas.width / 2, y);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(line, canvas.width / 2, y);
      });

      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = reject;
    img.src = imageData;
  });
}
