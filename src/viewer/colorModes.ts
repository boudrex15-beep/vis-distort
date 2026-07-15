/**
 * High-contrast reading palettes, the same polarity/colour options electronic
 * magnifiers offer. Each duotone maps content luminance onto a background→
 * foreground ramp. "Normal" leaves the image in full colour.
 */

export interface ColorMode {
  id: string;
  label: string;
  /** null = full colour (no duotone). */
  fg: [number, number, number] | null;
  bg: [number, number, number] | null;
}

/** CSS colours for drawing text directly in a palette (reading ticker). */
export function paletteCss(mode: ColorMode): { fg: string; bg: string } {
  const toHex = (c: [number, number, number]) =>
    "#" + c.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
  // "Normal" has no duotone; the text ticker still needs a palette, so default
  // to white-on-black (a standard high-contrast reading choice).
  if (!mode.fg || !mode.bg) return { fg: "#ffffff", bg: "#000000" };
  return { fg: toHex(mode.fg), bg: toHex(mode.bg) };
}

const rgb = (r: number, g: number, b: number): [number, number, number] => [
  r / 255,
  g / 255,
  b / 255,
];

export const COLOR_MODES: ColorMode[] = [
  { id: "normal", label: "Normal (full colour)", fg: null, bg: null },
  { id: "white-on-black", label: "White on black", fg: rgb(255, 255, 255), bg: rgb(0, 0, 0) },
  { id: "black-on-white", label: "Black on white", fg: rgb(0, 0, 0), bg: rgb(255, 255, 255) },
  { id: "yellow-on-black", label: "Yellow on black", fg: rgb(255, 214, 10), bg: rgb(0, 0, 0) },
  { id: "yellow-on-blue", label: "Yellow on blue", fg: rgb(255, 214, 10), bg: rgb(0, 32, 96) },
  { id: "black-on-yellow", label: "Black on yellow", fg: rgb(0, 0, 0), bg: rgb(255, 214, 10) },
];

export function colorModeById(id: string): ColorMode {
  return COLOR_MODES.find((m) => m.id === id) ?? COLOR_MODES[0]!;
}
