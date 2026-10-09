/**
 * Everything that describes one edit. Slider values use Lightroom's units so presets map across directly.
 */

export const HSL_COLOURS = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'] as const
export type HslColour = (typeof HSL_COLOURS)[number]

export const GRADE_ZONES = ['shadow', 'mid', 'high', 'global'] as const
export type GradeZone = (typeof GRADE_ZONES)[number]

type HslKeys = `hue_${HslColour}` | `sat_${HslColour}` | `lum_${HslColour}`
type GradeKeys = `g_${GradeZone}_hue` | `g_${GradeZone}_sat` | `g_${GradeZone}_lum`

/** Every slider-style value. All default to 0 except colour grading Blending (50) and LUT amount (100). */
export type Adjustments = {
  // Light and Colour (Lightroom's Basic panel)
  temp: number // -100..+100, relative like Lightroom shows for JPEGs
  tint: number
  exposure: number // -5..+5 stops
  contrast: number // -100..+100
  highlights: number
  shadows: number
  whites: number
  blacks: number
  vibrance: number
  saturation: number
  // Parametric tone curve, -100..+100
  curveHighlights: number
  curveLights: number
  curveDarks: number
  curveShadows: number
  // Colour grading: blending 0..100, balance -100..+100
  g_blending: number
  g_balance: number
  // LUT strength 0..100
  lutAmount: number
} & Record<HslKeys, number> & Record<GradeKeys, number> // hue 0..359, sat 0..100, lum -100..+100

export type AdjKey = keyof Adjustments

function makeDefaults(): Adjustments {
  const a: Record<string, number> = {
    temp: 0, tint: 0, exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, vibrance: 0, saturation: 0,
    curveHighlights: 0, curveLights: 0, curveDarks: 0, curveShadows: 0,
    g_blending: 50, g_balance: 0, lutAmount: 100,
  }
  for (const c of HSL_COLOURS) a[`hue_${c}`] = a[`sat_${c}`] = a[`lum_${c}`] = 0
  for (const z of GRADE_ZONES) a[`g_${z}_hue`] = a[`g_${z}_sat`] = a[`g_${z}_lum`] = 0
  return a as Adjustments
}
export const defaultAdjustments: Adjustments = makeDefaults()

/** A curve point on Lightroom's 0..255 grid. */
export type Pt = [number, number]
export type CurveChannel = 'master' | 'red' | 'green' | 'blue'
export type Curves = Record<CurveChannel, Pt[]> & {
  /** Where the parametric curve's four regions meet, 0..100 (Lightroom default 25 / 50 / 75). */
  splits: [number, number, number]
}
export const LINEAR: Pt[] = [[0, 0], [255, 255]]
export const defaultCurves: Curves = { master: LINEAR, red: LINEAR, green: LINEAR, blue: LINEAR, splits: [25, 50, 75] }

/** A 3D colour lookup table from a .cube file. */
export type Lut = { name: string; size: number; data: Float32Array } // RGB triples, red changing fastest

export type EditState = { adj: Adjustments; curves: Curves; lut: Lut | null }
export const defaultEdit: EditState = { adj: defaultAdjustments, curves: defaultCurves, lut: null }

export const isLinear = (pts: Pt[]) => pts.length === 2 && pts[0][0] === 0 && pts[0][1] === 0 && pts[1][0] === 255 && pts[1][1] === 255
export const curvesChanged = (c: Curves) =>
  !isLinear(c.master) || !isLinear(c.red) || !isLinear(c.green) || !isLinear(c.blue) || c.splits.join() !== '25,50,75'
