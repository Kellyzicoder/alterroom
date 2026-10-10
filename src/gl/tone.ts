import { KNOTS, EXPAND, CONTRAST, WHITES_UP, BLACKS_DOWN } from './measured'

/** Entries in each tone lookup table. */
export const TONE_SIZE = 1024

/** Straight-line lookup in a table of points (xs must go up). */
function interp(x: number, xs: number[], ys: number[]) {
  if (x <= xs[0]) return ys[0]
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) {
      const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1])
      return ys[i - 1] + t * (ys[i] - ys[i - 1])
    }
  }
  return ys[ys.length - 1]
}

const X = KNOTS.map((k) => k / 255)
const ANCHORS = [-100, -50, 0, 50, 100]

/** Contrast curve at any slider value: blend the two nearest measured curves (0 = no change). */
function contrastCurve(amount: number): number[] {
  const curve = (a: number) => (a === 0 ? X : CONTRAST[a])
  const v = Math.max(-100, Math.min(100, amount))
  let i = 0
  while (i < ANCHORS.length - 2 && v > ANCHORS[i + 1]) i++
  const a = ANCHORS[i], b = ANCHORS[i + 1], t = (v - a) / (b - a)
  const ca = curve(a), cb = curve(b)
  return ca.map((y, k) => y + t * (cb[k] - y))
}

/** A measured curve at part strength: blend between no change (0) and the full curve (1). */
const partway = (curve: number[], amount: number) => X.map((x, k) => x + amount * (curve[k] - x))

/**
 * Tone lookup tables, one per colour channel of an RGBA float texture:
 * - R: expand, display level 0..1 → scene brightness (white = 1)
 * - G: compress, the reverse. Indexed by the cube root of scene brightness, so dark tones get enough detail
 * - B: Whites (+ side) then Contrast, display level → display level, used without shifting hue
 * - A: Blacks (− side), display level → display level, used on each channel on its own
 * Whites − and Blacks + aren't curves: they're done in the shader (see tuning.ts).
 */
export function toneTable(contrast: number, whites: number, blacks: number): Float32Array {
  const table = new Float32Array(TONE_SIZE * 4)
  const c = contrastCurve(contrast)
  const w = partway(WHITES_UP, Math.max(0, Math.min(1, whites / 100)))
  const b = partway(BLACKS_DOWN, Math.max(0, Math.min(1, -blacks / 100)))
  for (let i = 0; i < TONE_SIZE; i++) {
    const x = i / (TONE_SIZE - 1)
    table[i * 4] = interp(x, X, EXPAND)
    table[i * 4 + 1] = interp(x * x * x, EXPAND, X)
    table[i * 4 + 2] = interp(interp(x, X, w), X, c)
    table[i * 4 + 3] = interp(x, X, b)
  }
  return table
}
