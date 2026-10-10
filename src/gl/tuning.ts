/**
 * Knobs that control how closely each slider matches Lightroom.
 * Exposure and Contrast don't need knobs: they use Lightroom's measured curves (measured.ts).
 * The values below are set by the auto-tuner (tools/tune) against Lightroom reference exports.
 */
export const tuning = {
  /** 1: Highlights, Shadows, Whites and Blacks work on scene brightness, like Exposure (matches better). 0: on display brightness. */
  sceneTone: 1,

  // Highlights / Shadows / Whites / Blacks. Lightroom treats + and − differently, so each side has its own knobs.
  // Stops = how much brighter (or darker) at ±100. Zones are on the 0..1 brightness scale.
  /** Highlights: fade in from the first zone value to the second. */
  highlightsUp: 3.22,
  highlightsDown: 2.88,
  highlightsZoneUp: [-0.051, 1.292] as [number, number],
  highlightsZoneDown: [-0.084, 1.32] as [number, number],
  /** Shadows: fade out from the first zone value to the second. */
  shadowsUp: 4.17,
  shadowsDown: 4.18,
  shadowsZoneUp: [-0.267, 0.237] as [number, number],
  shadowsZoneDown: [-0.233, 0.235] as [number, number],
  /** Whites − side (the + side is a measured curve): starts to act at this brightness. */
  whitesDown: 0.42,
  whitesFromDown: 0.043,
  /** Blacks + side (the − side is a measured curve): stops acting at this brightness. */
  blacksUp: 0.764,
  blacksToUp: 0.92,

  // Edge-aware mask (guided filter)
  /** Long side of the small image the mask is built from, in pixels. */
  maskSize: 512,
  /** Blur radius on that small image, in pixels (~1.5% of the photo). */
  maskRadius: 8,
  /** Edge sensitivity, in stops². Smaller keeps more edges (fewer halos, less smoothing). */
  maskEdge: 0.015,

  // White balance (relative sliders for JPEGs, −100..+100)
  /** Mired shift per Temp step (of the "assumed light"). */
  miredPerStep: 2.95,
  /** Colour temperature (kelvin) the Temp slider starts from. */
  wbBaseK: 6224,
  /** Colour temperature (kelvin) the Tint slider works at. */
  tintK: 5003,
  /** Green–magenta shift per Tint step (Δuv). */
  duvPerStep: 0.000373,

  // Colour
  /** Saturation +100 multiplier on colourfulness (1 = doubles it). */
  saturationStrength: 1.0,
  /** Vibrance ±100 strength. */
  vibranceStrength: 0.78,
  /** How much skin tones are protected from Vibrance (0..1). */
  skinProtect: 0,
}
