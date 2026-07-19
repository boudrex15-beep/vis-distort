import type { WarpRenderer, EnhanceParams } from "../warp/renderer";
import type { ContentSource } from "./sources";
import { ImageSource } from "./imageSource";
import { VideoSource } from "./videoSource";
import { PdfSource } from "./pdfSource";
import { TextSource } from "./textSource";
import { colorModeById, paletteCss } from "./colorModes";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const MAX_ZOOM = 8;

export type ReaderColors = "white-on-black" | "black-on-white";

export class ViewerMode {
  // Low-vision enhancements (see colorModes.ts for the palettes).
  brightness = 0;
  contrast = 1;
  colorModeId = "normal";
  /** Palette for the scrolling-text reader, independent of colour mode. */
  readerColors: ReaderColors = "white-on-black";

  private stage: HTMLElement;
  private renderer: WarpRenderer;
  private requestRender: () => void;
  private notify: (msg: string) => void;

  private source: ContentSource | null = null;
  private uploadedVersion = -1;
  private zoom = 1;
  private pan = { x: 0, y: 0 };
  private active = false;

  private dropHint: HTMLElement;
  private pdfBar: HTMLElement;
  private videoBar: HTMLElement;
  private videoPlayBtn: HTMLButtonElement;
  private videoSeek: HTMLInputElement;
  private videoTime: HTMLElement;
  private pdfPageInput: HTMLInputElement;
  private pdfPageCount: HTMLElement;
  private seeking = false;

  constructor(opts: {
    stage: HTMLElement;
    renderer: WarpRenderer;
    requestRender: () => void;
    notify: (msg: string) => void;
  }) {
    this.stage = opts.stage;
    this.renderer = opts.renderer;
    this.requestRender = opts.requestRender;
    this.notify = opts.notify;

    const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
    this.dropHint = $("drop-hint");
    this.pdfBar = $("pdf-bar");
    this.videoBar = $("video-bar");
    this.videoPlayBtn = $<HTMLButtonElement>("video-play");
    this.videoSeek = $<HTMLInputElement>("video-seek");
    this.videoTime = $("video-time");
    this.pdfPageInput = $<HTMLInputElement>("pdf-page-input");
    this.pdfPageCount = $("pdf-pagecount");

    this.wireMediaBars();
    this.wirePanZoom();
  }

  activate(): void {
    this.active = true;
    this.uploadedVersion = -1; // force content re-upload
    this.updateChrome();
  }

  deactivate(): void {
    this.active = false;
    if (this.source?.kind === "video") (this.source as VideoSource).video.pause();
    this.dropHint.hidden = true;
    this.pdfBar.hidden = true;
    this.videoBar.hidden = true;
  }

  get hasContent(): boolean {
    return this.source !== null;
  }

  get continuous(): boolean {
    return this.source?.continuous ?? false;
  }

  async openFile(file: File): Promise<void> {
    const name = file.name.toLowerCase();
    const type = file.type;
    try {
      let source: ContentSource;
      if (type.startsWith("image/")) {
        source = await ImageSource.fromFile(file);
      } else if (type.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/.test(name)) {
        const video = await VideoSource.fromFile(file);
        video.onFrame = this.requestRender;
        source = video;
      } else if (type === "application/pdf" || name.endsWith(".pdf")) {
        const pdf = await PdfSource.fromFile(file);
        pdf.onPageRendered = () => {
          this.updatePdfBar();
          this.requestRender();
        };
        source = pdf;
      } else {
        this.notify(`Can't open “${file.name}” — use an image, PDF, or video.`);
        return;
      }
      this.source?.destroy();
      this.source = source;
      this.uploadedVersion = -1;
      this.zoom = 1;
      this.pan = { x: 0, y: 0 };
      this.updateChrome();
      this.requestRender();
    } catch (err) {
      this.notify(err instanceof Error ? err.message : `Could not open ${file.name}.`);
    }
  }

  get magnification(): number {
    return this.zoom;
  }

  /** Set absolute magnification (1 = fit), keeping the view centered. */
  setZoom(z: number): void {
    this.zoom = Math.min(MAX_ZOOM, Math.max(1, z));
    this.requestRender();
  }

  zoomBy(factor: number, anchor?: { x: number; y: number }): void {
    if (!this.source) return;
    const before = this.contentRect();
    const newZoom = Math.min(16, Math.max(0.2, this.zoom * factor));
    if (anchor && before.w > 0) {
      const qx = (anchor.x - before.x) / before.w;
      const qy = (anchor.y - before.y) / before.h;
      this.zoom = newZoom;
      const after = this.contentRect();
      this.pan.x += anchor.x - (after.x + qx * after.w);
      this.pan.y += anchor.y - (after.y + qy * after.h);
    } else {
      this.zoom = newZoom;
    }
    this.onZoomChange?.();
    this.requestRender();
  }

  /** Notifies the UI so the magnification readout can follow wheel/keyboard zoom. */
  onZoomChange: (() => void) | null = null;

  enhanceParams(): EnhanceParams {
    const mode = colorModeById(this.colorModeId);
    // The text ticker is already drawn in the chosen palette, so don't also
    // apply the shader duotone (it would remap twice).
    const duotone = mode.fg && mode.bg && !(this.source instanceof TextSource);
    return {
      brightness: this.brightness,
      contrast: this.contrast,
      colorMode: duotone ? 1 : 0,
      fg: mode.fg ?? [1, 1, 1],
      bg: mode.bg ?? [0, 0, 0],
    };
  }

  setColorMode(id: string): void {
    this.colorModeId = id;
    this.requestRender();
  }

  /** Change the reader palette; applies immediately if the ticker is showing. */
  setReaderColors(id: ReaderColors): void {
    this.readerColors = id;
    if (this.source instanceof TextSource) {
      const p = paletteCss(colorModeById(id));
      this.source.setPalette(p.fg, p.bg);
    }
    this.requestRender();
  }

  get textReader(): TextSource | null {
    return this.source instanceof TextSource ? this.source : null;
  }

  /** Start (or replace) the scrolling-text reader with the given text. */
  startTextReader(text: string): void {
    if (!text.trim()) {
      this.notify("Type or paste some text first.");
      return;
    }
    const p = paletteCss(colorModeById(this.readerColors));
    if (this.source instanceof TextSource) {
      this.source.setText(text);
      this.source.setPalette(p.fg, p.bg);
    } else {
      this.source?.destroy();
      const ts = new TextSource(this.stage, text);
      ts.setPalette(p.fg, p.bg);
      this.source = ts;
      this.uploadedVersion = -1;
      this.zoom = 1;
      this.pan = { x: 0, y: 0 };
    }
    this.updateChrome();
    this.requestRender();
  }

  /** Extract text from the currently open PDF, if any. */
  async pdfText(): Promise<string | null> {
    if (this.source instanceof PdfSource) return this.source.getAllText();
    return null;
  }

  zoomReset(): void {
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.requestRender();
  }

  handleKeydown(e: KeyboardEvent): boolean {
    if (this.source instanceof PdfSource) {
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        void this.source.goToPage(this.source.pageNum + 1);
        return true;
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        void this.source.goToPage(this.source.pageNum - 1);
        return true;
      }
    }
    if (this.source instanceof VideoSource && e.key.toLowerCase() === "k") {
      this.toggleVideoPlayback();
      return true;
    }
    if (e.key === "+" || e.key === "=") {
      this.zoomBy(1.2);
      return true;
    }
    if (e.key === "-") {
      this.zoomBy(1 / 1.2);
      return true;
    }
    if (e.key === "0") {
      this.zoomReset();
      return true;
    }
    return false;
  }

  render(): void {
    const background: [number, number, number, number] = [0.06, 0.06, 0.08, 1];
    if (!this.source) {
      this.renderer.clearContent();
      this.renderer.render({
        contentRect: { x: 0, y: 0, w: 1, h: 1 },
        background,
      });
      return;
    }
    if (this.source instanceof TextSource) this.source.update();
    if (this.source.version !== this.uploadedVersion) {
      this.renderer.setContent(this.source.texSource);
      this.uploadedVersion = this.source.version;
    }
    if (this.source instanceof VideoSource) this.updateVideoBar();
    this.renderer.render({
      contentRect: this.contentRect(),
      background,
      enhance: this.enhanceParams(),
    });
  }

  private contentRect(): { x: number; y: number; w: number; h: number } {
    const sw = this.stage.clientWidth;
    const sh = this.stage.clientHeight;
    const src = this.source!;
    const fit = Math.min((sw * 0.98) / src.width, (sh * 0.98) / src.height);
    const w = src.width * fit * this.zoom;
    const h = src.height * fit * this.zoom;
    return {
      x: (sw - w) / 2 + this.pan.x,
      y: (sh - h) / 2 + this.pan.y,
      w,
      h,
    };
  }

  /** Optional hook so a host page can update chrome it owns (e.g. text bar). */
  onSourceChange: (() => void) | null = null;

  private updateChrome(): void {
    if (!this.active) return;
    this.dropHint.hidden = this.source !== null;
    this.pdfBar.hidden = !(this.source instanceof PdfSource);
    this.videoBar.hidden = !(this.source instanceof VideoSource);
    if (this.source instanceof PdfSource) this.updatePdfBar();
    if (this.source instanceof VideoSource) this.updateVideoBar();
    this.onSourceChange?.();
  }

  private updatePdfBar(): void {
    if (!(this.source instanceof PdfSource)) return;
    this.pdfPageInput.value = String(this.source.pageNum);
    this.pdfPageInput.max = String(this.source.pageCount);
    this.pdfPageCount.textContent = String(this.source.pageCount);
  }

  private toggleVideoPlayback(): void {
    if (!(this.source instanceof VideoSource)) return;
    const video = this.source.video;
    if (video.paused || video.ended) void video.play();
    else video.pause();
    this.requestRender();
  }

  private updateVideoBar(): void {
    if (!(this.source instanceof VideoSource)) return;
    const video = this.source.video;
    this.videoPlayBtn.textContent = video.paused || video.ended ? "▶" : "⏸";
    if (!this.seeking && Number.isFinite(video.duration) && video.duration > 0) {
      this.videoSeek.valueAsNumber = (video.currentTime / video.duration) * 1000;
    }
    this.videoTime.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
  }

  private wireMediaBars(): void {
    this.videoPlayBtn.addEventListener("click", () => this.toggleVideoPlayback());
    this.videoSeek.addEventListener("pointerdown", () => (this.seeking = true));
    this.videoSeek.addEventListener("pointerup", () => (this.seeking = false));
    this.videoSeek.addEventListener("input", () => {
      if (!(this.source instanceof VideoSource)) return;
      const video = this.source.video;
      if (Number.isFinite(video.duration)) {
        video.currentTime = (this.videoSeek.valueAsNumber / 1000) * video.duration;
        this.requestRender();
      }
    });

    document.getElementById("pdf-prev")!.addEventListener("click", () => {
      if (this.source instanceof PdfSource) void this.source.goToPage(this.source.pageNum - 1);
    });
    document.getElementById("pdf-next")!.addEventListener("click", () => {
      if (this.source instanceof PdfSource) void this.source.goToPage(this.source.pageNum + 1);
    });
    this.pdfPageInput.addEventListener("change", () => {
      if (this.source instanceof PdfSource) {
        void this.source.goToPage(this.pdfPageInput.valueAsNumber || 1);
      }
    });
  }

  private wirePanZoom(): void {
    this.stage.addEventListener(
      "wheel",
      (e) => {
        if (!this.active || !this.source) return;
        e.preventDefault();
        const rect = this.stage.getBoundingClientRect();
        const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        this.zoomBy(Math.exp(-e.deltaY * 0.0022), anchor);
      },
      { passive: false }
    );

    this.stage.addEventListener("pointerdown", (e) => {
      if (!this.active || !this.source) return;
      const target = e.target as HTMLElement;
      if (target.closest(".media-bar")) return;
      e.preventDefault();
      this.stage.setPointerCapture(e.pointerId);
      let last = { x: e.clientX, y: e.clientY };
      const move = (ev: PointerEvent) => {
        this.pan.x += ev.clientX - last.x;
        this.pan.y += ev.clientY - last.y;
        last = { x: ev.clientX, y: ev.clientY };
        this.requestRender();
      };
      const up = () => {
        this.stage.removeEventListener("pointermove", move);
        this.stage.removeEventListener("pointerup", up);
        this.stage.removeEventListener("pointercancel", up);
      };
      this.stage.addEventListener("pointermove", move);
      this.stage.addEventListener("pointerup", up);
      this.stage.addEventListener("pointercancel", up);
    });
  }
}
