export const VERTEX_SRC = `#version 300 es
void main() {
  // Fullscreen triangle from gl_VertexID; no buffers needed.
  vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const FRAGMENT_SRC = `#version 300 es
precision highp float;

uniform vec2  uCanvasSize;    // device px
uniform vec2  uFieldCenter;   // device px, top-left origin
uniform float uFieldSide;     // device px, side of the square warp field
uniform float uStrength;
uniform vec2  uContentOffset; // device px, top-left origin
uniform vec2  uContentSize;   // device px
uniform vec4  uBackground;
uniform float uFieldTexSize;
uniform sampler2D uFieldTex;   // RG32F displacement in field units, NEAREST
uniform sampler2D uContentTex;

// Low-vision enhancements, applied to the fetched content color.
uniform float uBrightness;  // added to each channel, -1..1
uniform float uContrast;    // multiplier about mid-grey, ~0.5..3
uniform int   uColorMode;   // 0 = full colour, 1 = duotone (fg/bg by luminance)
uniform vec3  uFg;          // duotone foreground (maps to bright luminance)
uniform vec3  uBg;          // duotone background (maps to dark luminance)

out vec4 outColor;

// Manual bilinear over the NEAREST float texture; avoids relying on the
// OES_texture_float_linear extension.
vec2 sampleField(vec2 uv) {
  vec2 st = clamp(uv, 0.0, 1.0) * (uFieldTexSize - 1.0);
  vec2 i = clamp(floor(st), 0.0, uFieldTexSize - 2.0);
  vec2 f = st - i;
  ivec2 ii = ivec2(i);
  vec2 t00 = texelFetch(uFieldTex, ii, 0).rg;
  vec2 t10 = texelFetch(uFieldTex, ii + ivec2(1, 0), 0).rg;
  vec2 t01 = texelFetch(uFieldTex, ii + ivec2(0, 1), 0).rg;
  vec2 t11 = texelFetch(uFieldTex, ii + ivec2(1, 1), 0).rg;
  return mix(mix(t00, t10, f.x), mix(t01, t11, f.x), f.y);
}

void main() {
  // Work in top-left-origin device pixels to match DOM coordinates.
  vec2 p = vec2(gl_FragCoord.x, uCanvasSize.y - gl_FragCoord.y);

  vec2 fieldUV = (p - uFieldCenter) / uFieldSide + 0.5;
  vec2 disp = vec2(0.0);
  if (all(greaterThan(fieldUV, vec2(0.0))) && all(lessThan(fieldUV, vec2(1.0)))) {
    disp = sampleField(fieldUV);
    // Fade to zero at the field border so there is no seam where the
    // warp region ends (the outer control ring is pinned to zero anyway).
    vec2 edge = min(fieldUV, 1.0 - fieldUV);
    disp *= smoothstep(0.0, 0.05, min(edge.x, edge.y));
  }

  vec2 src = p + disp * uFieldSide * uStrength;
  vec2 cuv = (src - uContentOffset) / uContentSize;
  if (all(greaterThanEqual(cuv, vec2(0.0))) && all(lessThanEqual(cuv, vec2(1.0)))) {
    vec3 rgb = texture(uContentTex, cuv).rgb;

    // Contrast about mid-grey, then brightness.
    rgb = (rgb - 0.5) * uContrast + 0.5 + uBrightness;

    // Optional duotone: map luminance onto a foreground/background ramp
    // (high-contrast reading palettes such as white-on-black).
    if (uColorMode == 1) {
      float lum = clamp(dot(rgb, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
      rgb = mix(uBg, uFg, lum);
    }

    outColor = vec4(clamp(rgb, 0.0, 1.0), 1.0);
  } else {
    outColor = uBackground;
  }
}
`;
