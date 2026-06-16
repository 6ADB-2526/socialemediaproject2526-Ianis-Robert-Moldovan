/** @format */

// =============================================================================
// media.js — hulpfuncties voor CAMERA, MICROFOON en het tekenen van tekst op
// een snap-foto.
// =============================================================================

// ── Media device guards ───────────────────────────────────────────────────

// Kan deze browser de camera/microfoon gebruiken?
export function canUseMediaDevices() {
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

// Foutmelding als media niet beschikbaar is. Camera/microfoon werken alleen op
// een veilige verbinding (localhost of HTTPS) — dat leggen we hier uit.
export function mediaUnavailableMessage(deviceName) {
  if (!window.isSecureContext) {
    return `${deviceName} werkt alleen via localhost of een HTTPS-link. Gebruik je tunnel-URL.`;
  }
  return `Je browser ondersteunt geen ${deviceName}toegang.`;
}

// Zet een technische fout om naar een begrijpelijke boodschap voor de gebruiker.
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

// Kiest een audioformaat dat deze browser ondersteunt voor het opnemen van
// spraakberichten (verschillende browsers ondersteunen verschillende formaten).
export function getSupportedAudioMimeType() {
  if (!window.MediaRecorder) return "";
  return (
    ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) || ""
  );
}

// ── Canvas / snap text overlay ────────────────────────────────────────────

// Hulpfunctie: breekt een lange tekst af in regels die binnen de breedte passen
// (maximaal 4 regels), zodat het op de foto netjes oogt.
function wrapCanvasText(ctx, text, maxWidth, font) {
  ctx.font = font;
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    // Past het woord er nog bij? Anders begin een nieuwe regel.
    if (ctx.measureText(next).width <= maxWidth || !current) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4); // hooguit 4 regels
}

// Tekent de getypte tekst (met zwarte rand + witte vulling) over een snap-foto.
// Werkt via een onzichtbaar 'canvas': we tekenen de foto + tekst en geven het
// resultaat terug als een nieuwe afbeelding (data-URL).
export function drawTextOnImage(imageData, text) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height); // eerst de foto

      // Lettergrootte en plaatsing berekenen op basis van de fotogrootte.
      const fontSize = Math.max(34, Math.round(canvas.width * 0.075));
      const maxWidth = canvas.width * 0.82;
      const lines = wrapCanvasText(ctx, text, maxWidth, `${fontSize}px Arial`);
      const lineHeight = fontSize * 1.18;
      const yStart = canvas.height * 0.44 - (lines.length * lineHeight) / 2;

      ctx.font = `800 ${fontSize}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";

      // Elke regel tekenen: eerst de donkere rand, dan de witte tekst erover.
      lines.forEach((line, i) => {
        const y = yStart + i * lineHeight + lineHeight / 2;
        ctx.lineWidth = Math.max(8, fontSize * 0.18);
        ctx.strokeStyle = "rgba(0,0,0,0.7)";
        ctx.strokeText(line, canvas.width / 2, y);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(line, canvas.width / 2, y);
      });

      resolve(canvas.toDataURL("image/jpeg", 0.9)); // resultaat als afbeelding
    };
    img.onerror = reject;
    img.src = imageData;
  });
}
