/**
 * The warp field is defined by an N×N lattice of control points spread over a
 * unit square. Each control point stores a displacement (dx, dy) in "field
 * units" (fractions of the field's side length). The lattice is interpolated
 * with Catmull-Rom bicubic splines into a dense texture the shader samples.
 *
 * Displacements are backward-mapping: a pixel at lattice position L shows the
 * content that lives at L + d. Dragging a grid intersection to make it LOOK
 * straight therefore directly produces the corrective warp.
 *
 * The outermost ring of control points is pinned to zero displacement:
 * AMD distortion is central (macular), and a zero border keeps the warp
 * continuous with the unwarped surroundings.
 */

export const FIELD_TEX_SIZE = 256;

function catmullRom(t: number): [number, number, number, number] {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    -0.5 * t3 + t2 - 0.5 * t,
    1.5 * t3 - 2.5 * t2 + 1,
    -1.5 * t3 + 2 * t2 + 0.5 * t,
    0.5 * t3 - 0.5 * t2,
  ];
}

export class ControlLattice {
  readonly n: number;
  /** n*n*(dx,dy) in field units, row-major, y down. */
  disp: Float32Array;

  constructor(n: number, disp?: Float32Array) {
    if (n < 3) throw new Error("lattice needs at least 3 points per side");
    this.n = n;
    this.disp = disp ? Float32Array.from(disp) : new Float32Array(n * n * 2);
    if (this.disp.length !== n * n * 2) throw new Error("displacement size mismatch");
  }

  /** Lattice position (u, v in [0,1]) of control point (i, j). */
  pos(i: number, j: number): [number, number] {
    return [i / (this.n - 1), j / (this.n - 1)];
  }

  get(i: number, j: number): [number, number] {
    const k = (j * this.n + i) * 2;
    return [this.disp[k]!, this.disp[k + 1]!];
  }

  set(i: number, j: number, dx: number, dy: number): void {
    if (this.isPinned(i, j)) return;
    const k = (j * this.n + i) * 2;
    this.disp[k] = dx;
    this.disp[k + 1] = dy;
  }

  /** Outermost ring stays at zero so the warp blends into its surroundings. */
  isPinned(i: number, j: number): boolean {
    return i === 0 || j === 0 || i === this.n - 1 || j === this.n - 1;
  }

  reset(): void {
    this.disp.fill(0);
  }

  /** Catmull-Rom sample of the displacement field at (u, v) in [0,1]. */
  sampleAt(u: number, v: number): [number, number] {
    const n = this.n;
    const x = u * (n - 1);
    const y = v * (n - 1);
    const ix = Math.min(Math.floor(x), n - 2);
    const iy = Math.min(Math.floor(y), n - 2);
    const wx = catmullRom(x - ix);
    const wy = catmullRom(y - iy);
    let dx = 0;
    let dy = 0;
    for (let m = 0; m < 4; m++) {
      const j = Math.min(Math.max(iy - 1 + m, 0), n - 1);
      let rx = 0;
      let ry = 0;
      for (let l = 0; l < 4; l++) {
        const i = Math.min(Math.max(ix - 1 + l, 0), n - 1);
        const k = (j * n + i) * 2;
        rx += wx[l]! * this.disp[k]!;
        ry += wx[l]! * this.disp[k + 1]!;
      }
      dx += wy[m]! * rx;
      dy += wy[m]! * ry;
    }
    return [dx, dy];
  }

  /** Interpolate into the dense FIELD_TEX_SIZE² RG texture data. */
  toDenseField(out?: Float32Array): Float32Array {
    const size = FIELD_TEX_SIZE;
    const data = out ?? new Float32Array(size * size * 2);
    for (let ty = 0; ty < size; ty++) {
      const v = ty / (size - 1);
      for (let tx = 0; tx < size; tx++) {
        const u = tx / (size - 1);
        const [dx, dy] = this.sampleAt(u, v);
        const k = (ty * size + tx) * 2;
        data[k] = dx;
        data[k + 1] = dy;
      }
    }
    return data;
  }

  /** Resample this lattice to a different density, preserving the field. */
  resampleTo(newN: number): ControlLattice {
    const out = new ControlLattice(newN);
    for (let j = 1; j < newN - 1; j++) {
      for (let i = 1; i < newN - 1; i++) {
        const [dx, dy] = this.sampleAt(i / (newN - 1), j / (newN - 1));
        out.set(i, j, dx, dy);
      }
    }
    return out;
  }

  hasAnyDisplacement(): boolean {
    return this.disp.some((v) => v !== 0);
  }

  clone(): ControlLattice {
    return new ControlLattice(this.n, this.disp);
  }
}
