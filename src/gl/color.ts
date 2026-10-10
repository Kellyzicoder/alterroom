/**
 * Colour-space maths, done on the CPU once and sent to the GPU as 3×3 matrices.
 *
 * Alterroom edits in linear ProPhoto RGB, the same space Lightroom uses internally:
 * very wide colours and no gamma curve, so edits never clip colours part-way through.
 */

export type Mat3 = number[] // 9 numbers, row-major
type Vec3 = [number, number, number]

// Standard matrices (Bruce Lindbloom's reference values).
const SRGB_TO_XYZ_D65: Mat3 = [0.4124564, 0.3575761, 0.1804375, 0.2126729, 0.7151522, 0.072175, 0.0193339, 0.119192, 0.9503041]
const PROPHOTO_TO_XYZ_D50: Mat3 = [0.7976749, 0.1351917, 0.0313534, 0.2880402, 0.7118741, 0.0000857, 0, 0, 0.82521]
const BRADFORD: Mat3 = [0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296]
const D65: Vec3 = [0.95047, 1, 1.08883]
const D50: Vec3 = [0.96422, 1, 0.82521]

export function mul(a: Mat3, b: Mat3): Mat3 {
  const r: Mat3 = []
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) r.push(a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j])
  return r
}

function apply(m: Mat3, v: Vec3): Vec3 {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]
}

export function inv(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g
  const det = a * A + b * B + c * C
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((x) => x / det)
}

/** Bradford chromatic adaptation: how colours shift when the light changes from `src` white to `dst` white. */
function adapt(src: Vec3, dst: Vec3): Mat3 {
  const s = apply(BRADFORD, src), d = apply(BRADFORD, dst)
  return mul(inv(BRADFORD), mul([d[0] / s[0], 0, 0, 0, d[1] / s[1], 0, 0, 0, d[2] / s[2]], BRADFORD))
}

/** linear sRGB → linear ProPhoto (D65 → D50 adapted). */
export const SRGB_TO_PROPHOTO = mul(inv(PROPHOTO_TO_XYZ_D50), mul(adapt(D65, D50), SRGB_TO_XYZ_D65))
export const PROPHOTO_TO_SRGB = inv(SRGB_TO_PROPHOTO)
/** Luminance (Y) weights for linear ProPhoto. */
export const PROPHOTO_LUMA: Vec3 = [PROPHOTO_TO_XYZ_D50[3], PROPHOTO_TO_XYZ_D50[4], PROPHOTO_TO_XYZ_D50[5]]

// --- White balance -------------------------------------------------------------------------

/** Chromaticity (x, y) of a black-body light at temperature T kelvin (Kim et al. approximation). */
function planckXY(T: number): [number, number] {
  const x = T <= 4000
    ? -0.2661239e9 / T ** 3 - 0.2343589e6 / T ** 2 + 0.8776956e3 / T + 0.17991
    : -3.0258469e9 / T ** 3 + 2.1070379e6 / T ** 2 + 0.2226347e3 / T + 0.24039
  const y = T <= 2222
    ? -1.1063814 * x ** 3 - 1.3481102 * x ** 2 + 2.18555832 * x - 0.20219683
    : T <= 4000
      ? -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867
      : 3.081758 * x ** 3 - 5.8733867 * x ** 2 + 3.75112997 * x - 0.37001483
  return [x, y]
}
const toUV = ([x, y]: [number, number]): [number, number] => {
  const d = -2 * x + 12 * y + 3
  return [(4 * x) / d, (6 * y) / d]
}
const uvToXYZ = ([u, v]: [number, number]): Vec3 => {
  const d = 2 * u - 8 * v + 4
  const x = (3 * u) / d, y = (2 * v) / d
  return [x / y, 1, (1 - x - y) / y]
}

/**
 * White-balance matrix in linear ProPhoto for JPEG-style relative sliders (−100..+100).
 * +Temp warms the photo (as if correcting for bluer light); +Tint pushes toward magenta.
 * Measured against Lightroom: it acts like Bradford adaptation from the "assumed" light back to the
 * starting light, with the gains scaled so no cone channel is darkened (like raw white balance).
 * At 0 / 0 this is exactly the identity matrix.
 */
export function whiteBalance(temp: number, tint: number, miredPerStep: number, duvPerStep: number, baseK: number, tintK: number): Mat3 {
  if (temp === 0 && tint === 0) return [1, 0, 0, 0, 1, 0, 0, 0, 1]
  // Temp: the assumed light moves along the black-body line, starting from baseK.
  const mired = 1e6 / baseK - temp * miredPerStep
  const T = Math.min(25000, Math.max(1667, 1e6 / mired))
  const gTemp = coneGains(uvToXYZ(toUV(planckXY(T))), uvToXYZ(toUV(planckXY(baseK))))
  // Tint: the assumed light moves at right angles to the black-body line (toward green for +), at tintK.
  const a = toUV(planckXY(tintK * 0.999)), b = toUV(planckXY(tintK * 1.001))
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const normal = [(a[1] - b[1]) / len, (b[0] - a[0]) / len] // tangent turned 90°
  if (normal[1] < 0) { normal[0] = -normal[0]; normal[1] = -normal[1] } // green side = higher v
  const at = toUV(planckXY(tintK))
  const gTint = coneGains(uvToXYZ([at[0] + normal[0] * tint * duvPerStep, at[1] + normal[1] * tint * duvPerStep]), uvToXYZ(at))
  // Bradford: gains on the three cone responses, smallest gain set to 1.
  const g = gTemp.map((v, i) => v * gTint[i])
  const low = Math.min(...g)
  const cone = mul(inv(BRADFORD), mul([g[0] / low, 0, 0, 0, g[1] / low, 0, 0, 0, g[2] / low], BRADFORD))
  return mul(inv(PROPHOTO_TO_XYZ_D50), mul(cone, PROPHOTO_TO_XYZ_D50))
}

/** Cone (Bradford) gains that adapt colours seen under light `from` to light `to`. */
function coneGains(from: Vec3, to: Vec3): Vec3 {
  const s = apply(BRADFORD, from), d = apply(BRADFORD, to)
  return [d[0] / s[0], d[1] / s[1], d[2] / s[2]]
}

/** GLSL wants matrices column by column. */
export const columnMajor = (m: Mat3) => new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]])
