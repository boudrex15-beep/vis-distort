// The legacy build supports a wider browser range (the main build needs
// bleeding-edge JS like Map.prototype.getOrInsertComputed).
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import type { ContentSource } from "./sources";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export class PdfSource implements ContentSource {
  readonly kind = "pdf";
  readonly continuous = false;
  version = 0;
  pageCount: number;
  pageNum = 0;
  onPageRendered: (() => void) | null = null;

  private doc: PDFDocumentProxy;
  private loadingTask: PDFDocumentLoadingTask;
  private canvas: HTMLCanvasElement;
  private rendering = false;
  private pendingPage: number | null = null;

  private constructor(loadingTask: PDFDocumentLoadingTask, doc: PDFDocumentProxy) {
    this.loadingTask = loadingTask;
    this.doc = doc;
    this.pageCount = doc.numPages;
    this.canvas = document.createElement("canvas");
    this.canvas.width = 2;
    this.canvas.height = 2;
  }

  static async fromFile(file: File): Promise<PdfSource> {
    const data = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data });
    const doc = await loadingTask.promise;
    const source = new PdfSource(loadingTask, doc);
    await source.goToPage(1);
    return source;
  }

  async goToPage(num: number): Promise<void> {
    const target = Math.min(Math.max(num, 1), this.pageCount);
    if (target === this.pageNum) return;
    if (this.rendering) {
      this.pendingPage = target;
      return;
    }
    this.rendering = true;
    try {
      const page = await this.doc.getPage(target);
      // Render at 2× device pixel ratio (capped) so zoomed text stays crisp.
      const scale = Math.min(3, (window.devicePixelRatio || 1) * 2);
      const viewport = page.getViewport({ scale });
      this.canvas.width = Math.ceil(viewport.width);
      this.canvas.height = Math.ceil(viewport.height);
      const ctx = this.canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      await page.render({ canvas: this.canvas, canvasContext: ctx, viewport }).promise;
      this.pageNum = target;
      this.version++;
      this.onPageRendered?.();
    } finally {
      this.rendering = false;
      if (this.pendingPage !== null) {
        const next = this.pendingPage;
        this.pendingPage = null;
        void this.goToPage(next);
      }
    }
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

  destroy(): void {
    void this.loadingTask.destroy();
  }
}
