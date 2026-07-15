import { ControlLattice } from "../warp/field";

export interface CalibrateLayout {
  fieldCenter: { x: number; y: number };
  fieldSide: number;
  fieldOrigin: { x: number; y: number };
}

/**
 * Amsler-grid calibration: the grid is rendered through the warp shader and
 * the user drags control points until the lines look straight to them. The
 * warp that achieves that IS the corrective warp — it is saved directly.
 */
const SAMPLE_TEXT =
  "The morning light came in slowly over the garden, and the birds began " +
  "their usual conversation in the old oak tree. She poured a cup of coffee " +
  "and sat by the window, watching the street wake up. A neighbor walked past " +
  "with a small brown dog, pausing at every lamp post along the way. " +
  "The newspaper lay folded on the table, its headlines waiting patiently. " +
  "Reading should feel steady and calm. When each line of this text looks " +
  "straight and evenly spaced to you, your calibration is working well. ";

export type CalibrateBackground = "grid" | "text";

export class CalibrateMode {
  lattice: ControlLattice;
  inverted = false; // false = light foreground on dark (clinical standard)
  backgroundMode: CalibrateBackground = "grid";
  /** Desired on-screen text size in CSS px (text background only). */
  textSize = 28;

  private stage: HTMLElement;
  private handlesLayer: HTMLElement;
  private onFieldChange: () => void;
  private gridCanvas: HTMLCanvasElement;
  private gridDirty = true;
  private handles = new Map<string, HTMLElement>();
  private selected: { i: number; j: number } | null = null;
  private undoStack: Float32Array[] = [];
  private lastUndoPushAt = 0;

  constructor(opts: {
    stage: HTMLElement;
    handlesLayer: HTMLElement;
    initialLattice: ControlLattice;
    onFieldChange: () => void;
  }) {
    this.stage = opts.stage;
    this.handlesLayer = opts.handlesLayer;
    this.lattice = opts.initialLattice;
    this.onFieldChange = opts.onFieldChange;
    this.gridCanvas = document.createElement("canvas");
    this.gridCanvas.width = 2048;
    this.gridCanvas.height = 2048;
  }

  layout(): CalibrateLayout {
    const w = this.stage.clientWidth;
    const h = this.stage.clientHeight;
    const side = Math.max(64, Math.min(w, h) * 0.92);
    const cx = w / 2;
    const cy = h / 2;
    return {
      fieldCenter: { x: cx, y: cy },
      fieldSide: side,
      fieldOrigin: { x: cx - side / 2, y: cy - side / 2 },
    };
  }

  /** The background texture; redrawn lazily when its settings change. */
  getGridTexture(): { canvas: HTMLCanvasElement; changed: boolean } {
    const changed = this.gridDirty;
    if (this.gridDirty) {
      if (this.backgroundMode === "text") this.drawText();
      else this.drawGrid();
      this.gridDirty = false;
    }
    return { canvas: this.gridCanvas, changed };
  }

  setBackgroundMode(mode: CalibrateBackground): void {
    this.backgroundMode = mode;
    this.gridDirty = true;
  }

  setTextSize(px: number): void {
    this.textSize = px;
    if (this.backgroundMode === "text") this.gridDirty = true;
  }

  /** Text is drawn at a screen-relative size, so a resize needs a redraw. */
  onResize(): void {
    if (this.backgroundMode === "text") this.gridDirty = true;
  }

  background(): [number, number, number, number] {
    if (this.inverted) return [1, 1, 1, 1];
    // Match the text background (#0a0a0d) so the field edge is seamless.
    return this.backgroundMode === "text" ? [0.039, 0.039, 0.051, 1] : [0, 0, 0, 1];
  }

  setInverted(inverted: boolean): void {
    this.inverted = inverted;
    this.gridDirty = true;
  }

  setLattice(lattice: ControlLattice): void {
    this.lattice = lattice;
    this.gridDirty = true;
    this.undoStack = [];
    this.selected = null;
    this.rebuildHandles();
    this.onFieldChange();
  }

  setDensity(n: number): void {
    if (n === this.lattice.n) return;
    // Not undoable: setLattice clears the undo stack (snapshot sizes differ).
    this.setLattice(this.lattice.resampleTo(n));
  }

  resetAll(): void {
    this.pushUndo(true);
    this.lattice.reset();
    this.fieldChanged();
  }

  resetSelected(): void {
    if (!this.selected) return;
    this.pushUndo(true);
    this.lattice.set(this.selected.i, this.selected.j, 0, 0);
    this.fieldChanged();
  }

  undo(): boolean {
    const prev = this.undoStack.pop();
    if (!prev) return false;
    // Undo snapshots always match the current density: the stack is cleared
    // whenever the lattice object is replaced (density change, profile load).
    this.lattice.disp.set(prev);
    this.fieldChanged();
    return true;
  }

  setHandlesVisible(visible: boolean): void {
    this.handlesLayer.classList.toggle("hidden-handles", !visible);
  }

  /** Create/refresh handle elements; call on activate and on resize. */
  rebuildHandles(): void {
    this.handlesLayer.textContent = "";
    this.handles.clear();
    const n = this.lattice.n;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (this.lattice.isPinned(i, j)) continue;
        const el = document.createElement("div");
        el.className = "handle";
        el.tabIndex = 0;
        el.setAttribute("role", "slider");
        el.setAttribute(
          "aria-label",
          `Grid point row ${j}, column ${i}. Drag or use arrow keys to move.`
        );
        el.dataset["i"] = String(i);
        el.dataset["j"] = String(j);
        this.attachHandleEvents(el, i, j);
        this.handlesLayer.appendChild(el);
        this.handles.set(`${i},${j}`, el);
      }
    }
    this.positionHandles();
  }

  positionHandles(): void {
    const { fieldOrigin, fieldSide } = this.layout();
    for (const [key, el] of this.handles) {
      const [i, j] = key.split(",").map(Number) as [number, number];
      const [lu, lv] = this.lattice.pos(i, j);
      const [dx, dy] = this.lattice.get(i, j);
      // Backward-mapping: a stored displacement d means the grid intersection
      // appears at (lattice position − d); place the handle where it appears.
      const x = fieldOrigin.x + (lu - dx) * fieldSide;
      const y = fieldOrigin.y + (lv - dy) * fieldSide;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.classList.toggle("moved", dx !== 0 || dy !== 0);
    }
  }

  activate(): void {
    this.handlesLayer.hidden = false;
    this.rebuildHandles();
  }

  deactivate(): void {
    this.handlesLayer.hidden = true;
    this.selected = null;
  }

  handleKeydown(e: KeyboardEvent): boolean {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      if (this.undo()) {
        e.preventDefault();
        return true;
      }
      return false;
    }
    if (!this.selected) return false;
    const step = e.shiftKey ? 0.5 : 2; // CSS px
    let mx = 0;
    let my = 0;
    switch (e.key) {
      case "ArrowLeft": mx = -step; break;
      case "ArrowRight": mx = step; break;
      case "ArrowUp": my = -step; break;
      case "ArrowDown": my = step; break;
      case "Escape": this.select(null); return true;
      default: return false;
    }
    e.preventDefault();
    const { fieldSide } = this.layout();
    const { i, j } = this.selected;
    this.pushUndo();
    const [dx, dy] = this.lattice.get(i, j);
    // Moving the handle by +m moves the perceived intersection by +m,
    // which means the stored displacement changes by −m.
    this.setClamped(i, j, dx - mx / fieldSide, dy - my / fieldSide);
    this.fieldChanged();
    return true;
  }

  private setClamped(i: number, j: number, dx: number, dy: number): void {
    // Keep each point within its own cell so the warp cannot fold over.
    const maxD = 0.9 / (this.lattice.n - 1);
    this.lattice.set(
      i, j,
      Math.max(-maxD, Math.min(maxD, dx)),
      Math.max(-maxD, Math.min(maxD, dy))
    );
  }

  private select(sel: { i: number; j: number } | null): void {
    this.selected = sel;
    for (const [key, el] of this.handles) {
      const [i, j] = key.split(",").map(Number);
      el.classList.toggle("selected", sel !== null && sel.i === i && sel.j === j);
    }
  }

  private attachHandleEvents(el: HTMLElement, i: number, j: number): void {
    el.addEventListener("focus", () => this.select({ i, j }));
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      el.focus();
      el.setPointerCapture(e.pointerId);
      el.classList.add("dragging");
      this.pushUndo(true);
      const move = (ev: PointerEvent) => {
        const { fieldOrigin, fieldSide } = this.layout();
        const stageRect = this.stage.getBoundingClientRect();
        const hx = ev.clientX - stageRect.left;
        const hy = ev.clientY - stageRect.top;
        const [lu, lv] = this.lattice.pos(i, j);
        // handle position h = lattice − d  ⇒  d = lattice − h
        const dx = lu - (hx - fieldOrigin.x) / fieldSide;
        const dy = lv - (hy - fieldOrigin.y) / fieldSide;
        this.setClamped(i, j, dx, dy);
        this.fieldChanged();
      };
      const up = () => {
        el.classList.remove("dragging");
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    });
  }

  private fieldChanged(): void {
    this.positionHandles();
    this.onFieldChange();
  }

  private pushUndo(force = false): void {
    const now = performance.now();
    // Coalesce rapid keyboard nudges into one undo step.
    if (!force && now - this.lastUndoPushAt < 600) return;
    this.lastUndoPushAt = now;
    this.undoStack.push(Float32Array.from(this.lattice.disp));
    if (this.undoStack.length > 100) this.undoStack.shift();
  }

  private drawText(): void {
    const ctx = this.gridCanvas.getContext("2d")!;
    const size = this.gridCanvas.width;
    const bg = this.inverted ? "#ffffff" : "#0a0a0d";
    const fg = this.inverted ? "#1a1a1a" : "#e8e8ec";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = fg;

    // The texture spans the field square, so scale the font so it appears
    // at ~textSize CSS px on screen at the current field size.
    const { fieldSide } = this.layout();
    const fontPx = Math.max(8, this.textSize * (size / fieldSide));
    ctx.font = `${fontPx}px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`;
    ctx.textBaseline = "top";

    const margin = fontPx;
    const maxWidth = size - margin * 2;
    const lineHeight = fontPx * 1.55;
    const words = SAMPLE_TEXT.split(" ").filter((w) => w.length > 0);

    let y = margin;
    let line = "";
    let wordIndex = 0;
    while (y + lineHeight <= size - margin) {
      const word = words[wordIndex % words.length]!;
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        ctx.fillText(line, margin, y);
        y += lineHeight;
        line = "";
      } else {
        line = candidate;
        wordIndex++;
      }
    }
  }

  private drawGrid(): void {
    const ctx = this.gridCanvas.getContext("2d")!;
    const size = this.gridCanvas.width;
    const bg = this.inverted ? "#ffffff" : "#000000";
    const fg = this.inverted ? "#000000" : "#ffffff";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 4;

    // Two grid lines per lattice cell, so waviness is visible between
    // control points too.
    const divisions = (this.lattice.n - 1) * 2;
    ctx.beginPath();
    for (let k = 0; k <= divisions; k++) {
      const t = Math.round((k / divisions) * size) + 0.5;
      ctx.moveTo(t, 0);
      ctx.lineTo(t, size);
      ctx.moveTo(0, t);
      ctx.lineTo(size, t);
    }
    ctx.stroke();
  }
}
