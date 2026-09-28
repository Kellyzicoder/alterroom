// All passes draw one full-screen rectangle. u_flipY is on only when drawing to the screen.
export const vertexSrc = `#version 300 es
in vec2 a_pos;
uniform bool u_flipY;
out vec2 v_uv;
void main() {
  float y = u_flipY ? 0.5 - a_pos.y * 0.5 : 0.5 + a_pos.y * 0.5;
  v_uv = vec2(a_pos.x * 0.5 + 0.5, y);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const common = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
vec3 srgbToLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 linearToSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float linearToSrgb1(float c) { return c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1.0 / 2.4) - 0.055; }
const vec3 SRGB_LUMA = vec3(0.2126729, 0.7151522, 0.072175);
`

// ---------------------------------------------------------------------------------------------
// Edge-aware mask: a "guided filter" (He et al.) on log brightness, built once per photo on a
// small copy. It gives a smooth brightness map that still stops at edges, so Highlights and
// Shadows can brighten a whole region without glowing halos around a skyline.
// ---------------------------------------------------------------------------------------------

/** Pass 1: log2 brightness L and L² of each pixel. */
export const lumSrc = common + `
uniform sampler2D u_image;
void main() {
  float y = dot(srgbToLinear(texture(u_image, v_uv).rgb), SRGB_LUMA);
  float L = log2(max(y, 1.0 / 4096.0));
  outColor = vec4(L, L * L, 0.0, 1.0);
}`

/** Box blur in one direction (run twice: across, then down). */
export const blurSrc = common + `
uniform sampler2D u_tex;
uniform vec2 u_dir;
uniform int u_radius;
void main() {
  vec2 step1 = u_dir / vec2(textureSize(u_tex, 0));
  vec4 sum = vec4(0.0);
  for (int i = -32; i <= 32; i++) {
    if (i < -u_radius || i > u_radius) continue;
    sum += texture(u_tex, v_uv + float(i) * step1);
  }
  outColor = sum / float(2 * u_radius + 1);
}`

/** Pass 3: guided filter coefficients a, b from local mean and variance. */
export const coeffSrc = common + `
uniform sampler2D u_tex;
uniform float u_eps;
void main() {
  vec2 m = texture(u_tex, v_uv).rg;   // mean L, mean L²
  float variance = max(m.y - m.x * m.x, 0.0);
  float a = variance / (variance + u_eps);
  outColor = vec4(a, m.x - a * m.x, 0.0, 1.0);
}`

// ---------------------------------------------------------------------------------------------
// Main edit. Runs once per pixel, every time a slider moves.
// Order: to linear ProPhoto → white balance → exposure → highlights/shadows → whites/blacks
//        → contrast → vibrance → saturation → back to sRGB for the screen.
// ---------------------------------------------------------------------------------------------
export const mainSrc = common + `
uniform sampler2D u_image;
uniform sampler2D u_mask;        // blurred guided-filter coefficients (a, b)
uniform bool u_useMask;
uniform bool u_bypass;

uniform mat3 u_toWorking;        // sRGB linear → ProPhoto linear, with white balance built in
uniform mat3 u_toOutput;         // ProPhoto linear → sRGB linear
uniform vec3 u_luma;             // ProPhoto luminance weights

uniform float u_exposure;        // stops
uniform float u_shoulderA;
uniform float u_knee;
uniform float u_shadows;         // stops at full strength (slider/100 × tuning)
uniform float u_highlights;
uniform vec2  u_shadowsZone;
uniform vec2  u_highlightsZone;
uniform float u_whites;
uniform float u_blacks;
uniform float u_whitesFrom;
uniform float u_blacksTo;
uniform float u_contrast;        // -1..1 × strength
uniform float u_vibrance;        // -1..1 × strength
uniform float u_skinProtect;
uniform float u_saturation;      // -1..1 × strength

vec3 applyExposure(vec3 lin) {
  float m = exp2(u_exposure);
  vec3 x = lin * m;
  if (u_exposure <= 0.0) return x;
  float k = u_knee;
  vec3 t = clamp((x - k) / (m - k), 0.0, 1.0);
  vec3 rolled = k + (1.0 - k) * (1.0 - exp(-u_shoulderA * t)) / (1.0 - exp(-u_shoulderA));
  return mix(x, rolled, step(k, x));
}

vec3 applyContrast(vec3 c) {
  if (u_contrast >= 0.0) return mix(c, c * c * (3.0 - 2.0 * c), u_contrast);
  vec3 flat1 = 0.5 - sin(asin(clamp(1.0 - 2.0 * c, -1.0, 1.0)) / 3.0);
  return mix(c, flat1, -u_contrast);
}

float hueOf(vec3 c) {
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), d = mx - mn;
  if (d < 1e-6) return 0.0;
  float h = mx == c.r ? mod((c.g - c.b) / d, 6.0) : mx == c.g ? (c.b - c.r) / d + 2.0 : (c.r - c.g) / d + 4.0;
  return h * 60.0;
}

void main() {
  vec4 src = texture(u_image, v_uv);
  if (u_bypass) { outColor = src; return; }

  vec3 lin = srgbToLinear(src.rgb);
  vec3 c = u_toWorking * lin;                       // linear ProPhoto, white-balanced
  c = applyExposure(c);

  // Highlights / Shadows: brighten or darken whole regions, judged by the smooth mask.
  if (u_shadows != 0.0 || u_highlights != 0.0) {
    float L = log2(max(dot(lin, SRGB_LUMA), 1.0 / 4096.0));
    float baseLog = L;
    if (u_useMask) { vec2 ab = texture(u_mask, v_uv).rg; baseLog = ab.x * L + ab.y; }
    float t = clamp(linearToSrgb1(exp2(baseLog + u_exposure)), 0.0, 1.0);  // region brightness 0..1
    float ws = 1.0 - smoothstep(u_shadowsZone.x, u_shadowsZone.y, t);
    float wh = smoothstep(u_highlightsZone.x, u_highlightsZone.y, t);
    c *= exp2(u_shadows * ws + u_highlights * wh);
  }

  // Whites / Blacks: move the very ends of the range.
  if (u_whites != 0.0 || u_blacks != 0.0) {
    float y = clamp(linearToSrgb1(max(dot(c, u_luma), 0.0)), 0.0, 1.0);
    c *= exp2(u_whites * smoothstep(u_whitesFrom, 1.0, y) + u_blacks * (1.0 - smoothstep(0.0, u_blacksTo, y)));
  }

  // Contrast: S-curve in "Melissa RGB" (ProPhoto colours, sRGB curve), like Lightroom's readouts.
  c = max(c, 0.0);
  if (u_contrast != 0.0) c = srgbToLinear(applyContrast(linearToSrgb(clamp(c, 0.0, 1.0))));

  // Vibrance: boosts dull colours more than rich ones, and goes easy on skin tones.
  float luma = dot(c, u_luma);
  if (u_vibrance != 0.0) {
    float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
    float sat = mx > 1e-6 ? (mx - mn) / mx : 0.0;
    float h = hueOf(c);
    float skin = 1.0 - u_skinProtect * smoothstep(0.0, 15.0, h) * (1.0 - smoothstep(40.0, 60.0, h));
    float amount = u_vibrance > 0.0 ? u_vibrance * (1.0 - sat) * skin : u_vibrance;
    c = max(mix(vec3(luma), c, 1.0 + amount), 0.0);
  }

  // Saturation: every colour equally. −100 gives exact black and white.
  c = max(mix(vec3(luma), c, 1.0 + u_saturation), 0.0);

  vec3 outLin = clamp(u_toOutput * c, 0.0, 1.0);
  outColor = vec4(linearToSrgb(outLin), 1.0);
}`
