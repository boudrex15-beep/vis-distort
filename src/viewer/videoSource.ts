import type { ContentSource } from "./sources";

export class VideoSource implements ContentSource {
  readonly kind = "video";
  version = 0;
  readonly video: HTMLVideoElement;
  private objectUrl: string;
  private frameCallbackId = 0;
  /** Called when a new frame is ready, so the app can schedule a render. */
  onFrame: (() => void) | null = null;

  private constructor(video: HTMLVideoElement, objectUrl: string) {
    this.video = video;
    this.objectUrl = objectUrl;
    this.watchFrames();
  }

  static fromFile(file: File): Promise<VideoSource> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = false;
      video.playsInline = true;
      video.src = url;
      video.addEventListener(
        "loadeddata",
        () => resolve(new VideoSource(video, url)),
        { once: true }
      );
      video.addEventListener(
        "error",
        () => {
          URL.revokeObjectURL(url);
          reject(new Error("Could not load this video (unsupported format?)."));
        },
        { once: true }
      );
    });
  }

  private watchFrames(): void {
    // Bump version per decoded frame; seeks fire this too, so paused
    // scrubbing also updates the picture.
    const tick = () => {
      this.version++;
      this.onFrame?.();
      this.frameCallbackId = this.video.requestVideoFrameCallback(tick);
    };
    this.frameCallbackId = this.video.requestVideoFrameCallback(tick);
  }

  get width(): number {
    return this.video.videoWidth;
  }

  get height(): number {
    return this.video.videoHeight;
  }

  get texSource(): TexImageSource {
    return this.video;
  }

  get continuous(): boolean {
    return !this.video.paused && !this.video.ended;
  }

  destroy(): void {
    if (this.frameCallbackId) this.video.cancelVideoFrameCallback(this.frameCallbackId);
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
    URL.revokeObjectURL(this.objectUrl);
  }
}
