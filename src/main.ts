import "./style.css";
import { WarpRenderer } from "./warp/renderer";
import { ViewerMode, type ReaderColors } from "./viewer/viewer";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
};

const stage = $("stage");
const canvas = $<HTMLCanvasElement>("glcanvas");
const toast = $("toast");

let toastTimer = 0;
function notify(msg: string): void {
  toast.textContent = msg;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.hidden = true), 3500);
}

let renderer: WarpRenderer;
try {
  renderer = new WarpRenderer(canvas);
} catch (err) {
  stage.innerHTML = `<p style="padding:2rem;font-size:1.2rem">${
    err instanceof Error ? err.message : "Failed to start the renderer."
  }</p>`;
  throw err;
}

// ---------- render loop ----------

let dirty = true;
const requestRender = (): void => {
  dirty = true;
};

const viewer = new ViewerMode({ stage, renderer, requestRender, notify });

function frame(): void {
  if (renderer.resize()) dirty = true;
  if (dirty || viewer.continuous) {
    dirty = false;
    viewer.render();
  }
  requestAnimationFrame(frame);
}

new ResizeObserver(requestRender).observe(stage);

// ---------- open file ----------

const openInput = $<HTMLInputElement>("open-file-input");
$("open-file-btn").addEventListener("click", () => openInput.click());
openInput.addEventListener("change", () => {
  const file = openInput.files?.[0];
  openInput.value = "";
  if (file) void viewer.openFile(file);
});

// ---------- drag & drop ----------

for (const evt of ["dragover", "dragenter"] as const) {
  window.addEventListener(evt, (e) => {
    e.preventDefault();
    stage.classList.add("drag-over");
  });
}
window.addEventListener("dragleave", (e) => {
  if ((e as DragEvent).relatedTarget === null) stage.classList.remove("drag-over");
});
window.addEventListener("drop", (e) => {
  e.preventDefault();
  stage.classList.remove("drag-over");
  const file = e.dataTransfer?.files?.[0];
  if (file) void viewer.openFile(file);
});

// ---------- enhancement controls + persistence ----------

const ENHANCE_KEY = "visdistort.enhance.v1";

const magSlider = $<HTMLInputElement>("mag-slider");
const magValue = $("mag-value");
const brightnessSlider = $<HTMLInputElement>("brightness-slider");
const brightnessValue = $("brightness-value");
const contrastSlider = $<HTMLInputElement>("contrast-slider");
const contrastValue = $("contrast-value");
const colorModeSelect = $<HTMLSelectElement>("color-mode");
const readColorsSelect = $<HTMLSelectElement>("read-colors");

function saveSettings(): void {
  try {
    localStorage.setItem(
      ENHANCE_KEY,
      JSON.stringify({
        brightness: viewer.brightness,
        contrast: viewer.contrast,
        colorModeId: viewer.colorModeId,
        readerColors: viewer.readerColors,
      })
    );
  } catch {
    /* storage unavailable — fine */
  }
}

function syncMag(): void {
  magSlider.value = viewer.magnification.toFixed(2);
  magValue.textContent = `${viewer.magnification.toFixed(1)}×`;
}
viewer.onZoomChange = syncMag;

magSlider.addEventListener("input", () => {
  viewer.setZoom(magSlider.valueAsNumber);
  magValue.textContent = `${viewer.magnification.toFixed(1)}×`;
});

brightnessSlider.addEventListener("input", () => {
  viewer.brightness = brightnessSlider.valueAsNumber / 100;
  brightnessValue.textContent = `${brightnessSlider.value}%`;
  saveSettings();
  requestRender();
});

contrastSlider.addEventListener("input", () => {
  viewer.contrast = contrastSlider.valueAsNumber / 100;
  contrastValue.textContent = `${viewer.contrast.toFixed(2)}×`;
  saveSettings();
  requestRender();
});

colorModeSelect.addEventListener("change", () => {
  viewer.setColorMode(colorModeSelect.value);
  saveSettings();
});

readColorsSelect.addEventListener("change", () => {
  viewer.setReaderColors(readColorsSelect.value as ReaderColors);
  saveSettings();
});

$("zoom-in-btn").addEventListener("click", () => viewer.zoomBy(1.25));
$("zoom-out-btn").addEventListener("click", () => viewer.zoomBy(1 / 1.25));
$("zoom-reset-btn").addEventListener("click", () => {
  viewer.zoomReset();
  syncMag();
});

// ---------- scrolling-text reader ----------

const readText = $<HTMLTextAreaElement>("read-text");
const textBar = $("text-bar");
const textPlay = $<HTMLButtonElement>("text-play");
const textSpeed = $<HTMLInputElement>("text-speed");
const textFont = $<HTMLInputElement>("text-font");

const updateTextBar = (): void => {
  const reader = viewer.textReader;
  textBar.hidden = !reader;
  if (reader) textPlay.textContent = reader.playing ? "⏸" : "▶";
};
viewer.onSourceChange = updateTextBar;

$("read-start").addEventListener("click", () => {
  viewer.startTextReader(readText.value);
  const reader = viewer.textReader;
  if (reader) {
    reader.speed = textSpeed.valueAsNumber;
    reader.fontSize = textFont.valueAsNumber;
  }
  requestRender();
});

$("read-from-pdf").addEventListener("click", async () => {
  const text = await viewer.pdfText();
  if (!text) {
    notify("Open a PDF first, then pull its text.");
    return;
  }
  readText.value = text;
  viewer.startTextReader(text);
  requestRender();
});

textPlay.addEventListener("click", () => {
  viewer.textReader?.togglePlay();
  updateTextBar();
  requestRender();
});
$("text-restart").addEventListener("click", () => {
  viewer.textReader?.restart();
  requestRender();
});
textSpeed.addEventListener("input", () => {
  if (viewer.textReader) viewer.textReader.speed = textSpeed.valueAsNumber;
});
textFont.addEventListener("input", () => {
  if (viewer.textReader) viewer.textReader.fontSize = textFont.valueAsNumber;
  requestRender();
});

// ---------- keyboard ----------

window.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement;
  if (target.closest("input, select, textarea, dialog")) return;
  if (viewer.handleKeydown(e)) {
    e.preventDefault();
    requestRender();
    syncMag();
  }
});

// ---------- help ----------

const helpDialog = $<HTMLDialogElement>("help-dialog");
$("help-btn").addEventListener("click", () => helpDialog.showModal());

// ---------- restore saved settings & boot ----------

try {
  const raw = localStorage.getItem(ENHANCE_KEY);
  if (raw) {
    const s = JSON.parse(raw) as {
      brightness?: number;
      contrast?: number;
      colorModeId?: string;
      readerColors?: string;
    };
    if (typeof s.brightness === "number") {
      viewer.brightness = s.brightness;
      brightnessSlider.value = String(Math.round(s.brightness * 100));
      brightnessValue.textContent = `${brightnessSlider.value}%`;
    }
    if (typeof s.contrast === "number") {
      viewer.contrast = s.contrast;
      contrastSlider.value = String(Math.round(s.contrast * 100));
      contrastValue.textContent = `${s.contrast.toFixed(2)}×`;
    }
    if (typeof s.colorModeId === "string") {
      viewer.colorModeId = s.colorModeId;
      colorModeSelect.value = s.colorModeId;
    }
    if (s.readerColors === "white-on-black" || s.readerColors === "black-on-white") {
      viewer.readerColors = s.readerColors;
      readColorsSelect.value = s.readerColors;
    }
  }
} catch {
  /* ignore corrupt settings */
}

viewer.activate();
syncMag();
requestAnimationFrame(frame);
