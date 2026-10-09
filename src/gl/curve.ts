import type { Curves, Pt } from '../edit'
import { isLinear } from '../edit'

/** How many steps the curve lookup table has. More than Lightroom's 256 so gradients stay smooth. */
export const CURVE_SIZE = 1024

/**
 * Smooth curve through points that never overshoots (monotone cubic, Fritsch–Carlson).
 * Returns a function from 0..1 to 0..1.
 */
export function spline(points: Pt[]): (x: number) => number {
  const pts = [...points].sort((a, b) => a[0] - b[0]).map(([x, y]) => [x / 255, y / 255] as [number, number])
  if (pts.length < 2) return (x) => x
  const n = pts.length
  const dx: number[] = [], m: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(Math.max(1e-6, pts[i + 1][0] - pts[i][0]))
    m.push((pts[i + 1][1] - pts[i][1]) / dx[i])
  }
  const t: number[] = [m[0]]
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2)
  t.push(m[n - 2])
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = t[i + 1] = 0; continue }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i] }
  }
  return (x) => {
    if (x <= pts[0][0]) return pts[0][1]
    if (x >= pts[n - 1][0]) return pts[n - 1][1]
    let i = 0
    while (i < n - 2 && x > pts[i + 1][0]) i++
    const h = dx[i], u = (x - pts[i][0]) / h
    const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2
    return h00 * pts[i][1] + h10 * h * t[i] + h01 * pts[i + 1][1] + h11 * h * t[i + 1]
  }
}

/**
 * Parametric curve: four sliders that lift or lower one region each (Shadows, Darks, Lights, Highlights),
 * split at three points. Black and white stay fixed. Strength is a starting guess, to tune against Lightroom.
 */
function parametric(amounts: [number, number, number, number], splits: [number, number, number]) {
  const [s1, s2, s3] = splits.map((s) => s / 100)
  const edges = [0, s1, s2, s3, 1]
  const STRENGTH = 0.18
  return (x: number) => {
    let y = x
    for (let k = 0; k < 4; k++) {
      if (!amounts[k]) continue
      const c = (edges[k] + edges[k + 1]) / 2
      const w = Math.max(0.05, (edges[k + 1] - edges[k]) * 0.75)
      y += (amounts[k] / 100) * STRENGTH * Math.exp(-(((x - c) / w) ** 2))
    }
    const ends = Math.min(1, x * 10) * Math.min(1, (1 - x) * 10) // keep black and white fixed
    return x + (y - x) * ends
  }
}

/**
 * Build the lookup table: for each channel, parametric curve → master point curve → that channel's curve.
 * RGBA float data, CURVE_SIZE entries; returns null when every curve is a straight line (nothing to do).
 */
export function buildCurveTable(curves: Curves, amounts: [number, number, number, number]): Float32Array | null {
  const useParam = amounts.some((a) => a !== 0)
  const channels = [curves.red, curves.green, curves.blue]
  if (!useParam && isLinear(curves.master) && channels.every(isLinear)) return null
  const p = parametric(amounts, curves.splits)
  const master = spline(curves.master)
  const per = channels.map(spline)
  const out = new Float32Array(CURVE_SIZE * 4)
  for (let i = 0; i < CURVE_SIZE; i++) {
    const x = i / (CURVE_SIZE - 1)
    const base = master(useParam ? p(x) : x)
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.min(1, Math.max(0, per[c](base)))
    out[i * 4 + 3] = 1
  }
  return out
}
