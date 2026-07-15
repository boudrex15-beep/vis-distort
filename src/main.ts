import "./style.css";
import { WarpRenderer } from "./warp/renderer";
import { ControlLattice, FIELD_TEX_SIZE } from "./warp/field";
import { ProfileManager } from "./profiles";
import { CalibrateMode } from "./calibrate/calibrate";
import { ViewerMode } from "./viewer/viewer";

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

const profiles = new ProfileManager();

// ---------- render loop ----------

type Mode = "calibrate" | "view";
let mode: Mode = "calibrate";
let dirty = true;
let contentOwnedByCalibrate = false;
const requestRender = (): void => {
  dirty = true;
};

const denseField = new Float32Array(FIELD_TEX_SIZE * FIELD_TEX_SIZE * 2);
let autosaveTimer = 0;

const calibrate = new CalibrateMode({
  stage,
  handlesLayer: $("handles-layer"),
  initialLattice:
    profiles.loadWorking() ??
    (profiles.active ? profiles.latticeFor(profiles.active) : new ControlLattice(9)),
  onFieldChange: () => {
    uploadField();
    window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => profiles.saveWorking(calibrate.lattice), 300);
    requestRender();
  },
});

const viewer = new ViewerMode({ stage, renderer, requestRender, notify });

function uploadField(): void {
  calibrate.lattice.toDenseField(denseField);
  renderer.setFieldData(denseField);
}

function renderCalibrate(): void {
  const { canvas: grid, changed } = calibrate.getGridTexture();
  if (changed || !contentOwnedByCalibrate) {
    renderer.setContent(grid);
    contentOwnedByCalibrate = true;
  }
  const layout = calibrate.layout();
  renderer.render({
    strength: 1,
    fieldSide: layout.fieldSide,
    fieldCenter: layout.fieldCenter,
    contentRect: {
      x: layout.fieldOrigin.x,
      y: layout.fieldOrigin.y,
      w: layout.fieldSide,
      h: layout.fieldSide,
    },
    background: calibrate.background(),
  });
}

function frame(): void {
  if (renderer.resize()) {
    if (mode === "calibrate") {
      calibrate.positionHandles();
      calibrate.onResize();
    }
    dirty = true;
  }
  if (dirty || (mode === "view" && viewer.continuous)) {
    dirty = false;
    if (mode === "calibrate") renderCalibrate();
    else viewer.render();
  }
  requestAnimationFrame(frame);
}

new ResizeObserver(requestRender).observe(stage);

// ---------- mode switching ----------

const tabCalibrate = $<HTMLButtonElement>("tab-calibrate");
const tabView = $<HTMLButtonElement>("tab-view");
const panelCalibrate = $("panel-calibrate");
const panelView = $("panel-view");
const fixationDot = $("fixation-dot");
const fixationToggle = $<HTMLInputElement>("fixation-toggle");
const dropHint = $("drop-hint");

function setMode(next: Mode): void {
  mode = next;
  const isCal = next === "calibrate";
  tabCalibrate.classList.toggle("active", isCal);
  tabView.classList.toggle("active", !isCal);
  tabCalibrate.setAttribute("aria-selected", String(isCal));
  tabView.setAttribute("aria-selected", String(!isCal));
  panelCalibrate.hidden = !isCal;
  panelView.hidden = isCal;
  if (isCal) {
    viewer.deactivate();
    calibrate.activate();
    contentOwnedByCalibrate = false; // force grid re-upload
    fixationDot.style.display = "";
  } else {
    calibrate.deactivate();
    viewer.activate();
    contentOwnedByCalibrate = false;
    dropHint.hidden = viewer.hasContent;
    fixationDot.style.display = fixationToggle.checked ? "" : "none";
  }
  requestRender();
}

tabCalibrate.addEventListener("click", () => setMode("calibrate"));
tabView.addEventListener("click", () => setMode("view"));

// ---------- profile UI ----------

const profileSelect = $<HTMLSelectElement>("profile-select");

function refreshProfileSelect(): void {
  profileSelect.textContent = "";
  const list = profiles.list();
  if (profiles.activeId === null) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = list.length ? "— unsaved calibration —" : "— no profiles yet —";
    opt.selected = true;
    profileSelect.appendChild(opt);
  }
  for (const p of list) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    opt.selected = p.id === profiles.activeId;
    profileSelect.appendChild(opt);
  }
}

profiles.onChange = refreshProfileSelect;
refreshProfileSelect();

profileSelect.addEventListener("change", () => {
  const id = profileSelect.value;
  if (!id) return;
  profiles.setActive(id);
  const p = profiles.active;
  if (p) {
    calibrate.setLattice(profiles.latticeFor(p));
    notify(`Loaded profile “${p.name}”.`);
  }
});

$("save-profile-btn").addEventListener("click", () => {
  const current = profiles.active;
  const name = window.prompt("Profile name:", current?.name ?? "My eyes")?.trim();
  if (!name) return;
  if (current && name === current.name) {
    profiles.updateActive(calibrate.lattice);
    notify(`Updated profile “${name}”.`);
  } else {
    profiles.create(name, calibrate.lattice);
    notify(`Saved profile “${name}”.`);
  }
});

$("new-profile-btn").addEventListener("click", () => {
  if (
    calibrate.lattice.hasAnyDisplacement() &&
    !window.confirm("Start a new calibration? Unsaved changes will be cleared.")
  ) {
    return;
  }
  profiles.setActive(null);
  calibrate.setLattice(new ControlLattice(calibrate.lattice.n));
});

$("rename-profile-btn").addEventListener("click", () => {
  const p = profiles.active;
  if (!p) {
    notify("No profile selected.");
    return;
  }
  const name = window.prompt("New name:", p.name)?.trim();
  if (name) profiles.rename(p.id, name);
});

$("delete-profile-btn").addEventListener("click", () => {
  const p = profiles.active;
  if (!p) {
    notify("No profile selected.");
    return;
  }
  if (!window.confirm(`Delete profile “${p.name}”?`)) return;
  profiles.remove(p.id);
  const next = profiles.active;
  calibrate.setLattice(
    next ? profiles.latticeFor(next) : new ControlLattice(calibrate.lattice.n)
  );
});

$("export-profile-btn").addEventListener("click", () => {
  const p = profiles.active;
  if (!p) {
    notify("Save a profile first, then export it.");
    return;
  }
  const blob = new Blob([profiles.exportProfile(p)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${p.name.replace(/[^\w-]+/g, "_")}.visdistort.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

const importInput = $<HTMLInputElement>("import-file-input");
$("import-profile-btn").addEventListener("click", () => importInput.click());
importInput.addEventListener("change", async () => {
  const file = importInput.files?.[0];
  importInput.value = "";
  if (!file) return;
  try {
    const p = profiles.importProfile(await file.text());
    calibrate.setLattice(profiles.latticeFor(p));
    notify(`Imported profile “${p.name}”.`);
  } catch (err) {
    notify(err instanceof Error ? err.message : "Import failed.");
  }
});

// ---------- calibrate panel ----------

const textSizeGroup = $("text-size-group");
$<HTMLSelectElement>("calib-background").addEventListener("change", (e) => {
  const mode = (e.target as HTMLSelectElement).value as "grid" | "text";
  calibrate.setBackgroundMode(mode);
  textSizeGroup.hidden = mode !== "text";
  requestRender();
});

const textSizeSlider = $<HTMLInputElement>("text-size-slider");
const textSizeValue = $("text-size-value");
textSizeSlider.addEventListener("input", () => {
  calibrate.setTextSize(textSizeSlider.valueAsNumber);
  textSizeValue.textContent = `${textSizeSlider.value} px`;
  requestRender();
});

$<HTMLSelectElement>("grid-density").addEventListener("change", (e) => {
  calibrate.setDensity(Number((e.target as HTMLSelectElement).value));
});
$<HTMLInputElement>("show-handles").addEventListener("change", (e) => {
  calibrate.setHandlesVisible((e.target as HTMLInputElement).checked);
});
$<HTMLInputElement>("grid-invert").addEventListener("change", (e) => {
  calibrate.setInverted((e.target as HTMLInputElement).checked);
  requestRender();
});
$("undo-btn").addEventListener("click", () => {
  if (!calibrate.undo()) notify("Nothing to undo.");
});
$("reset-point-btn").addEventListener("click", () => calibrate.resetSelected());
$("reset-all-btn").addEventListener("click", () => {
  if (window.confirm("Reset the whole grid to flat?")) calibrate.resetAll();
});

// ---------- view panel ----------

const openInput = $<HTMLInputElement>("open-file-input");
$("open-file-btn").addEventListener("click", () => openInput.click());
openInput.addEventListener("change", () => {
  const file = openInput.files?.[0];
  openInput.value = "";
  if (file) void viewer.openFile(file);
});

const correctionToggle = $<HTMLInputElement>("correction-toggle");
correctionToggle.addEventListener("change", () => {
  viewer.correctionOn = correctionToggle.checked;
  requestRender();
});

const strengthSlider = $<HTMLInputElement>("strength-slider");
const strengthValue = $("strength-value");
strengthSlider.addEventListener("input", () => {
  viewer.strength = strengthSlider.valueAsNumber / 100;
  strengthValue.textContent = `${strengthSlider.value}%`;
  requestRender();
});

const fieldSizeSlider = $<HTMLInputElement>("field-size-slider");
const fieldSizeValue = $("field-size-value");
fieldSizeSlider.addEventListener("input", () => {
  viewer.fieldSizeFactor = fieldSizeSlider.valueAsNumber / 100;
  fieldSizeValue.textContent = `${fieldSizeSlider.value}%`;
  requestRender();
});

fixationToggle.addEventListener("change", () => {
  if (mode === "view") fixationDot.style.display = fixationToggle.checked ? "" : "none";
});

$("zoom-in-btn").addEventListener("click", () => viewer.zoomBy(1.25));
$("zoom-out-btn").addEventListener("click", () => viewer.zoomBy(1 / 1.25));
$("zoom-reset-btn").addEventListener("click", () => viewer.zoomReset());

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
  if (!file) return;
  if (mode !== "view") setMode("view");
  void viewer.openFile(file);
});

// ---------- keyboard ----------

window.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement;
  if (target.closest("input, select, textarea, dialog")) return;
  if (mode === "calibrate") {
    if (calibrate.handleKeydown(e)) requestRender();
    return;
  }
  if (e.key === " ") {
    e.preventDefault();
    correctionToggle.checked = !correctionToggle.checked;
    viewer.correctionOn = correctionToggle.checked;
    requestRender();
    return;
  }
  if (viewer.handleKeydown(e)) {
    e.preventDefault();
    requestRender();
  }
});

// ---------- help ----------

const helpDialog = $<HTMLDialogElement>("help-dialog");
$("help-btn").addEventListener("click", () => helpDialog.showModal());

// ---------- low-vision aids (only present on the "aids" page) ----------
// Every control below is looked up defensively; on the original distortion
// page these elements do not exist, so this whole section is inert there.

const opt = <T extends HTMLElement>(id: string): T | null =>
  document.getElementById(id) as T | null;

const colorModeSelect = opt<HTMLSelectElement>("color-mode");
if (colorModeSelect) {
  const ENHANCE_KEY = "visdistort.enhance.v1";

  const magSlider = opt<HTMLInputElement>("mag-slider")!;
  const magValue = opt("mag-value")!;
  const brightnessSlider = opt<HTMLInputElement>("brightness-slider")!;
  const brightnessValue = opt("brightness-value")!;
  const contrastSlider = opt<HTMLInputElement>("contrast-slider")!;
  const contrastValue = opt("contrast-value")!;

  const saveEnhance = (): void => {
    try {
      localStorage.setItem(
        ENHANCE_KEY,
        JSON.stringify({
          brightness: viewer.brightness,
          contrast: viewer.contrast,
          colorModeId: viewer.colorModeId,
        })
      );
    } catch {
      /* storage unavailable — fine */
    }
  };

  const syncMag = (): void => {
    magSlider.value = viewer.magnification.toFixed(2);
    magValue.textContent = `${viewer.magnification.toFixed(1)}×`;
  };
  viewer.onZoomChange = syncMag;

  magSlider.addEventListener("input", () => {
    viewer.setZoom(magSlider.valueAsNumber);
    magValue.textContent = `${viewer.magnification.toFixed(1)}×`;
  });

  brightnessSlider.addEventListener("input", () => {
    viewer.brightness = brightnessSlider.valueAsNumber / 100;
    brightnessValue.textContent = `${brightnessSlider.value}%`;
    saveEnhance();
    requestRender();
  });

  contrastSlider.addEventListener("input", () => {
    viewer.contrast = contrastSlider.valueAsNumber / 100;
    contrastValue.textContent = `${(viewer.contrast).toFixed(2)}×`;
    saveEnhance();
    requestRender();
  });

  colorModeSelect.addEventListener("change", () => {
    viewer.setColorMode(colorModeSelect.value);
    saveEnhance();
  });

  // Reading (scrolling text).
  const readText = opt<HTMLTextAreaElement>("read-text")!;
  const textBar = opt("text-bar")!;
  const textPlay = opt<HTMLButtonElement>("text-play")!;
  const textSpeed = opt<HTMLInputElement>("text-speed")!;
  const textFont = opt<HTMLInputElement>("text-font")!;

  const updateTextBar = (): void => {
    const reader = viewer.textReader;
    textBar.hidden = !reader;
    if (reader) textPlay.textContent = reader.playing ? "⏸" : "▶";
  };
  viewer.onSourceChange = updateTextBar;

  opt("read-start")!.addEventListener("click", () => {
    viewer.startTextReader(readText.value);
    const reader = viewer.textReader;
    if (reader) {
      reader.speed = textSpeed.valueAsNumber;
      reader.fontSize = textFont.valueAsNumber;
    }
    requestRender();
  });

  opt("read-from-pdf")!.addEventListener("click", async () => {
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
  textSpeed.addEventListener("input", () => {
    if (viewer.textReader) viewer.textReader.speed = textSpeed.valueAsNumber;
  });
  textFont.addEventListener("input", () => {
    if (viewer.textReader) viewer.textReader.fontSize = textFont.valueAsNumber;
    requestRender();
  });

  // Restore saved enhancement settings.
  try {
    const raw = localStorage.getItem(ENHANCE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as {
        brightness?: number;
        contrast?: number;
        colorModeId?: string;
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
    }
  } catch {
    /* ignore corrupt settings */
  }
  syncMag();
}

// ---------- boot ----------

uploadField();
setMode(profiles.list().length > 0 && !calibrate.lattice.hasAnyDisplacement() ? "view" : "calibrate");
requestAnimationFrame(frame);
