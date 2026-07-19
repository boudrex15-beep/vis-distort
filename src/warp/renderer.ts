import { VERTEX_SRC, FRAGMENT_SRC } from "./shaders";

export interface EnhanceParams {
  brightness: number; // -1..1, added per channel
  contrast: number; // multiplier about mid-grey
  /** 0 = full colour, 1 = duotone by luminance. */
  colorMode: 0 | 1;
  fg: [number, number, number];
  bg: [number, number, number];
}

export const NEUTRAL_ENHANCE: EnhanceParams = {
  brightness: 0,
  contrast: 1,
  colorMode: 0,
  fg: [1, 1, 1],
  bg: [0, 0, 0],
};

export interface RenderParams {
  /** Where the content is drawn, CSS px relative to the canvas. */
  contentRect: { x: number; y: number; w: number; h: number };
  background: [number, number, number, number];
  /** Low-vision enhancements; omit for neutral (no change). */
  enhance?: EnhanceParams;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

export class WarpRenderer {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private contentTex: WebGLTexture;
  private hasContent = false;

  private u(name: string): WebGLUniformLocation | null {
    return this.uniforms[name] ?? null;
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", { antialias: false });
    if (!gl) {
      throw new Error(
        "WebGL2 is not available in this browser. This viewer needs WebGL2 (Safari 15+, Chrome, Firefox, Edge)."
      );
    }
    this.gl = gl;

    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SRC));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program link failed: ${gl.getProgramInfoLog(program)}`);
    }
    gl.useProgram(program);

    for (const name of [
      "uCanvasSize",
      "uContentOffset",
      "uContentSize",
      "uBackground",
      "uContentTex",
      "uBrightness",
      "uContrast",
      "uColorMode",
      "uFg",
      "uBg",
    ]) {
      this.uniforms[name] = gl.getUniformLocation(program, name);
    }
    gl.uniform1i(this.u("uContentTex"), 0);

    this.contentTex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.contentTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Upload (or re-upload, e.g. each video frame) the content texture. */
  setContent(source: TexImageSource): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.contentTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    this.hasContent = true;
  }

  clearContent(): void {
    this.hasContent = false;
  }

  /** Resize the drawing buffer to match layout size; returns true if changed. */
  resize(): boolean {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      return true;
    }
    return false;
  }

  render(params: RenderParams): void {
    const gl = this.gl;
    const dpr = window.devicePixelRatio || 1;
    const W = this.canvas.width;
    const H = this.canvas.height;
    gl.viewport(0, 0, W, H);

    const [br, bg, bb, ba] = params.background;
    if (!this.hasContent) {
      gl.clearColor(br, bg, bb, ba);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }

    gl.uniform2f(this.u("uCanvasSize"), W, H);
    gl.uniform2f(
      this.u("uContentOffset"),
      params.contentRect.x * dpr,
      params.contentRect.y * dpr
    );
    gl.uniform2f(
      this.u("uContentSize"),
      Math.max(1e-6, params.contentRect.w * dpr),
      Math.max(1e-6, params.contentRect.h * dpr)
    );
    gl.uniform4f(this.u("uBackground"), br, bg, bb, ba);

    const e = params.enhance ?? NEUTRAL_ENHANCE;
    gl.uniform1f(this.u("uBrightness"), e.brightness);
    gl.uniform1f(this.u("uContrast"), e.contrast);
    gl.uniform1i(this.u("uColorMode"), e.colorMode);
    gl.uniform3f(this.u("uFg"), e.fg[0], e.fg[1], e.fg[2]);
    gl.uniform3f(this.u("uBg"), e.bg[0], e.bg[1], e.bg[2]);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
