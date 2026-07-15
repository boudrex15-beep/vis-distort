import type { ContentSource } from "./sources";

/**
 * Horizontally scrolling single-line "ticker" text. Research on central vision
 * loss (macular disease) found scrolling text gives better reading comprehension
 * than static text or word-by-word RSVP, and it lets the reader hold their gaze
 * slightly off the text (eccentric viewing). Drawn to a canvas → texture so the
 * distortion correction and colour/contrast enhancements apply to it too.
 */
export class TextSource implements ContentSource {
  readonly kind = "image"; // a static-style texture we refresh ourselves
  version = 0;
  playing = true;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private text: string;
  private offset = 0; // px scrolled
  private textWidth = 0;
  private lastNow = 0;

  fontSize = 48; // CSS px on screen at 1× magnification
  speed = 90; // px/sec at 1× magnification
  fg = "#ffffff";
  bg = "#000000";

  private stage: HTMLElement;

  constructor(stage: HTMLElement, text: string) {
    this.stage = stage;
    this.text = text.replace(/\s+/g, " ").trim() + "        ";
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d")!;
    this.resizeToStage();
    this.draw();
  }

  setText(text: string): void {
    this.text = text.replace(/\s+/g, " ").trim() + "        ";
    this.offset = 0;
    this.draw();
  }

  setPalette(fg: string, bg: string): void {
    this.fg = fg;
    this.bg = bg;
    this.draw();
  }

  togglePlay(): void {
    this.playing = !this.playing;
    this.lastNow = 0;
  }

  restart(): void {
    this.offset = 0;
    this.draw();
  }

  private resizeToStage(): void {
    const dpr = window.devicePixelRatio || 1;
    // One tall line the width of the stage; scrolled content is a moving window.
    this.canvas.width = Math.max(2, Math.round(this.stage.clientWidth * dpr));
    this.canvas.height = Math.max(2, Math.round(this.fontSize * 2.2 * dpr));
  }

  /** Advance the scroll based on elapsed wall-clock time, then redraw. */
  update(): void {
    if (this.playing) {
      const now = performance.now();
      if (this.lastNow === 0) this.lastNow = now;
      const dt = (now - this.lastNow) / 1000;
      this.lastNow = now;
      const dpr = window.devicePixelRatio || 1;
      this.offset += this.speed * dpr * dt;
      const wrap = this.textWidth + this.canvas.width;
      if (wrap > 0 && this.offset > wrap) this.offset -= wrap;
    }
    this.draw();
  }

  private draw(): void {
    const dpr = window.devicePixelRatio || 1;
    // Keep canvas sized to the current stage / font size.
    const wantW = Math.max(2, Math.round(this.stage.clientWidth * dpr));
    const wantH = Math.max(2, Math.round(this.fontSize * 2.2 * dpr));
    if (this.canvas.width !== wantW || this.canvas.height !== wantH) {
      this.canvas.width = wantW;
      this.canvas.height = wantH;
    }

    const ctx = this.ctx;
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = this.fg;
    ctx.textBaseline = "middle";
    ctx.font = `${this.fontSize * dpr}px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`;
    this.textWidth = ctx.measureText(this.text).width;

    const y = this.canvas.height / 2;
    // Start off the right edge, scroll left; repeat so the line is continuous.
    let x = this.canvas.width - this.offset;
    const step = this.textWidth || 1;
    while (x < this.canvas.width) {
      ctx.fillText(this.text, x, y);
      x += step;
    }
    this.version++;
  }

  get width(): number {
    return this.canvas.width;
  }
  get height(): number {
    return this.canvas.height;
  }
  get texSource(): TexImageSource {
    return this.canvas;
  }
  get continuous(): boolean {
    return this.playing;
  }
  destroy(): void {
    /* nothing to release */
  }
}
