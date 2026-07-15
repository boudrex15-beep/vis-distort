import { VERTEX_SRC, FRAGMENT_SRC } from "./shaders";
import { FIELD_TEX_SIZE } from "./field";

export interface RenderParams {
  /** Warp strength multiplier (0 disables, 1 = as calibrated). */
  strength: number;
  /** Side of the square warp field, CSS px. */
  fieldSide: number;
  /** Warp field center, CSS px relative to the canvas. */
  fieldCenter: { x: number; y: number };
  /** Where the content is drawn, CSS px relative to the canvas. */
  contentRect: { x: number; y: number; w: number; h: number };
  background: [number, number, number, number];
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

  private u(name: string): WebGLUniformLocation | null {
    return this.uniforms[name] ?? null;
  }
  private fieldTex: WebGLTexture;
  private contentTex: WebGLTexture;
  private hasContent = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", { antialias: false });
    if (!gl) {
      throw new Error(
        "WebGL2 is not available in this browser. Vis-Distort needs WebGL2 (Safari 15+, Chrome, Firefox, Edge)."
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
      "uFieldCenter",
      "uFieldSide",
      "uStrength",
      "uContentOffset",
      "uContentSize",
      "uBackground",
      "uFieldTexSize",
      "uFieldTex",
      "uContentTex",
    ]) {
      this.uniforms[name] = gl.getUniformLocation(program, name);
    }
    gl.uniform1i(this.u("uFieldTex"), 0);
    gl.uniform1i(this.u("uContentTex"), 1);
    gl.uniform1f(this.u("uFieldTexSize"), FIELD_TEX_SIZE);

    this.fieldTex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.setFieldData(new Float32Array(FIELD_TEX_SIZE * FIELD_TEX_SIZE * 2));

    this.contentTex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.contentTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  setFieldData(data: Float32Array): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RG32F, FIELD_TEX_SIZE, FIELD_TEX_SIZE, 0, gl.RG, gl.FLOAT, data
    );
  }

  /** Upload (or re-upload, e.g. each video frame) the content texture. */
  setContent(source: TexImageSource): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
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
      this.u("uFieldCenter"),
      params.fieldCenter.x * dpr,
      params.fieldCenter.y * dpr
    );
    gl.uniform1f(this.u("uFieldSide"), params.fieldSide * dpr);
    gl.uniform1f(this.u("uStrength"), params.strength);
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

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
