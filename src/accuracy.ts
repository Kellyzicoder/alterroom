/**
 * Accuracy meter: compares Alterroom's output against a reference exported from Lightroom / Camera Raw
 * with the same slider values.
 *
 * Colour difference is measured as ΔE (CIE76) in the Lab colour space.
 * ΔE ≈ 2.3 is the "just noticeable difference": below it, most people can't see a change.
 * The match score is the % of pixels below that threshold.
 */

export type MatchResult = {
  matchPct: number // % of pixels with ΔE < 2.3
  avgDeltaE: number
  p95DeltaE: number // 95% of pixels are at or below this ΔE
  width: number
  height: number
}

export const JND = 2.3

const toLin = new Float32Array(256).map((_, i) => {
  const c = i / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
})

function f(t: number) {
  return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116
}

/** sRGB 8-bit → CIE Lab (D65). */
function lab(r: number, g: number, b: number): [number, number, number] {
  const R = toLin[r], G = toLin[g], B = toLin[b]
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047
  const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883
  const fx = f(x), fy = f(y), fz = f(z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/** Compare two same-size RGBA pixel buffers (top row first). */
export function compare(ours: Uint8ClampedArray, ref: Uint8ClampedArray, width: number, height: number): MatchResult {
  const n = width * height
  const deltas = new Float32Array(n)
  let sum = 0, under = 0
  for (let i = 0; i < n; i++) {
    const o = i * 4
    const [l1, a1, b1] = lab(ours[o], ours[o + 1], ours[o + 2])
    const [l2, a2, b2] = lab(ref[o], ref[o + 1], ref[o + 2])
    const d = Math.hypot(l1 - l2, a1 - a2, b1 - b2)
    deltas[i] = d
    sum += d
    if (d < JND) under++
  }
  deltas.sort()
  return { matchPct: (under / n) * 100, avgDeltaE: sum / n, p95DeltaE: deltas[Math.floor(n * 0.95)], width, height }
}

/** Draw a reference image at exactly w×h and return its pixels. */
export function referencePixels(img: ImageBitmap, w: number, h: number): Uint8ClampedArray {
  const c = new OffscreenCanvas(w, h)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h).data
}
