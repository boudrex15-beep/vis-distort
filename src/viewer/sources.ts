/** A piece of content (image, video, or PDF page) the viewer can display. */
export interface ContentSource {
  readonly kind: "image" | "video" | "pdf";
  /** Natural pixel size of the current frame/page. */
  readonly width: number;
  readonly height: number;
  /** Bumped whenever a new frame/page needs uploading to the GPU. */
  readonly version: number;
  readonly texSource: TexImageSource;
  /** True while frames keep coming (video playing). */
  readonly continuous: boolean;
  destroy(): void;
}
