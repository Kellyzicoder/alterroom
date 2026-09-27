// Vertex shader: draws one full-screen rectangle and passes texture coords through.
export const vertexSrc = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5); // flip Y so image is upright
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

// Fragment shader: runs once per pixel on the GPU — this is where the editing happens.
export const fragmentSrc = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_image;
uniform float u_exposure;   // stops, -3..+3
uniform float u_contrast;   // -1..+1
uniform float u_saturation; // -1..+1
uniform bool  u_bypass;     // true = show original (before/after)

// Photos are stored in sRGB (gamma-encoded). Light math must happen in linear space.
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
vec3 linearToSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec4 src = texture(u_image, v_uv);
  if (u_bypass) { outColor = src; return; }

  // 1. Exposure — like opening the camera aperture: multiply light by 2^stops.
  vec3 lin = srgbToLinear(src.rgb) * exp2(u_exposure);

  // 2. Back to display space for perceptual adjustments.
  vec3 c = linearToSrgb(clamp(lin, 0.0, 1.0));

  // 3. Contrast — push tones away from (or toward) mid-grey.
  c = (c - 0.5) * (1.0 + u_contrast) + 0.5;

  // 4. Saturation — blend between greyscale and the colour.
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(luma), c, 1.0 + u_saturation);

  outColor = vec4(clamp(c, 0.0, 1.0), src.a);
}`
