import type { ContentSource } from "./sources";

export class ImageSource implements ContentSource {
  readonly kind = "image";
  readonly continuous = false;
  version = 1;
  private bitmap: ImageBitmap;

  private constructor(bitmap: ImageBitmap) {
    this.bitmap = bitmap;
  }

  static async fromFile(file: File): Promise<ImageSource> {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return new ImageSource(bitmap);
  }

  get width(): number {
    return this.bitmap.width;
  }

  get height(): number {
    return this.bitmap.height;
  }

  get texSource(): TexImageSource {
    return this.bitmap;
  }

  destroy(): void {
    this.bitmap.close();
  }
}
