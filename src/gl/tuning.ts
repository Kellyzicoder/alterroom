/**
 * Knobs that control how closely each slider matches Lightroom.
 * Tune these against Lightroom / Camera Raw reference exports using the match meter in the app.
 * They are starting guesses until real reference images have been measured.
 */
export const tuning = {
  // Exposure
  /** Linear-light value where exposure highlight roll-off begins (0..1). */
  knee: 0.7,

  // Contrast
  /** How much of the S-curve Contrast +100 applies (0..1). */
  contrastStrength: 0.5,
  /** Contrast −100 blend toward the flatter inverse S-curve (0..1). */
  contrastStrengthNeg: 0.5,

  // Highlights / Shadows (adaptive, uses the edge-aware mask)
  /** Stops of brightening/darkening at Shadows ±100, in the darkest areas. */
  shadowsStops: 1.6,
  /** Stops of brightening/darkening at Highlights ±100, in the brightest areas. */
  highlightsStops: 1.6,
  /** Zone edges on the 0..1 brightness scale (Adobe: shadows 10–30%, highlights 70–90%). */
  shadowsZone: [0.1, 0.5] as [number, number],
  highlightsZone: [0.55, 0.9] as [number, number],

  // Whites / Blacks (per-pixel, near the ends of the range)
  whitesStops: 1.0,
  blacksStops: 1.2,
  /** Where Whites starts to act, and where Blacks stops acting (0..1 brightness). */
  whitesFrom: 0.6,
  blacksTo: 0.4,

  // Edge-aware mask (guided filter)
  /** Long side of the small image the mask is built from, in pixels. */
  maskSize: 512,
  /** Blur radius on that small image, in pixels (~1.5% of the photo). */
  maskRadius: 8,
  /** Edge sensitivity, in stops². Smaller keeps more edges (fewer halos, less smoothing). */
  maskEdge: 0.015,

  // White balance (relative sliders for JPEGs, −100..+100)
  /** Mired shift per Temp step. 100 steps ≈ 5000 K → 10000 K "assumed light". */
  miredPerStep: 1.0,
  /** Green–magenta shift per Tint step (Δuv). */
  duvPerStep: 0.00033,

  // Colour
  /** Saturation +100 multiplier on colourfulness (1 = doubles it). */
  saturationStrength: 1.0,
  /** Vibrance ±100 strength. */
  vibranceStrength: 1.0,
  /** How much skin tones are protected from Vibrance (0..1). */
  skinProtect: 0.5,
}

/**
 * The highlight roll-off curve must meet the straight part smoothly (same slope at the knee).
 * That needs a steepness "a" with a / (1 - e^-a) = (m - k) / (1 - k), solved here with Newton's method.
 */
export function solveShoulder(exposure: number, knee: number): number {
  const m = Math.pow(2, exposure)
  const target = (m - knee) / (1 - knee)
  if (target <= 1.0001) return 1e-4
  let a = 2 * target
  for (let i = 0; i < 30; i++) {
    const e = Math.exp(-a)
    const f = a / (1 - e) - target
    const df = (1 - e - a * e) / ((1 - e) * (1 - e))
    const next = a - f / df
    if (Math.abs(next - a) < 1e-7) return next
    a = next > 0 ? next : a / 2
  }
  return a
}
