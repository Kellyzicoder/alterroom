import type { Adjustments, AdjKey, Curves, Pt } from '../edit'
import { HSL_COLOURS } from '../edit'

const CRS = 'http://ns.adobe.com/camera-raw-settings/1.0/'

export type PresetResult = {
  name: string
  /** Only the settings the preset contains; everything else is left as it was. */
  adj: Partial<Adjustments>
  curves: Partial<Curves>
  /** Settings in the preset that Alterroom can't apply yet, in plain words. */
  unsupported: string[]
  /** Name of an Adobe profile ("Look") the preset relies on, if any. */
  look: string | null
}

/** Lightroom name → Alterroom setting. */
const DIRECT: [string, AdjKey][] = [
  ['Exposure2012', 'exposure'],
  ['Contrast2012', 'contrast'],
  ['Highlights2012', 'highlights'],
  ['Shadows2012', 'shadows'],
  ['Whites2012', 'whites'],
  ['Blacks2012', 'blacks'],
  ['Vibrance', 'vibrance'],
  ['Saturation', 'saturation'],
  ['IncrementalTemperature', 'temp'],
  ['IncrementalTint', 'tint'],
  ['ParametricShadows', 'curveShadows'],
  ['ParametricDarks', 'curveDarks'],
  ['ParametricLights', 'curveLights'],
  ['ParametricHighlights', 'curveHighlights'],
  // Colour grading. Lightroom keeps the shadow/highlight wheel colours under the old split-toning names.
  ['SplitToningShadowHue', 'g_shadow_hue'],
  ['SplitToningShadowSaturation', 'g_shadow_sat'],
  ['SplitToningHighlightHue', 'g_high_hue'],
  ['SplitToningHighlightSaturation', 'g_high_sat'],
  ['SplitToningBalance', 'g_balance'],
  ['ColorGradeShadowLum', 'g_shadow_lum'],
  ['ColorGradeMidtoneHue', 'g_mid_hue'],
  ['ColorGradeMidtoneSat', 'g_mid_sat'],
  ['ColorGradeMidtoneLum', 'g_mid_lum'],
  ['ColorGradeHighlightLum', 'g_high_lum'],
  ['ColorGradeGlobalHue', 'g_global_hue'],
  ['ColorGradeGlobalSat', 'g_global_sat'],
  ['ColorGradeGlobalLum', 'g_global_lum'],
  ['ColorGradeBlending', 'g_blending'],
]
const LR_COLOUR: Record<(typeof HSL_COLOURS)[number], string> = {
  red: 'Red', orange: 'Orange', yellow: 'Yellow', green: 'Green', aqua: 'Aqua', blue: 'Blue', purple: 'Purple', magenta: 'Magenta',
}
for (const c of HSL_COLOURS) {
  DIRECT.push([`HueAdjustment${LR_COLOUR[c]}`, `hue_${c}`])
  DIRECT.push([`SaturationAdjustment${LR_COLOUR[c]}`, `sat_${c}`])
  DIRECT.push([`LuminanceAdjustment${LR_COLOUR[c]}`, `lum_${c}`])
}

/** Settings Alterroom doesn't do yet, reported to the user only when the preset actually changes them. */
const NOT_YET: [string, string][] = [
  ['Clarity2012', 'Clarity'],
  ['Texture', 'Texture'],
  ['Dehaze', 'Dehaze'],
  ['Sharpness', 'Sharpening'],
  ['LuminanceSmoothing', 'Noise reduction'],
  ['PostCropVignetteAmount', 'Vignette'],
  ['GrainAmount', 'Grain'],
  ['RedHue', 'Calibration'],
  ['RedSaturation', 'Calibration'],
  ['GreenHue', 'Calibration'],
  ['GreenSaturation', 'Calibration'],
  ['BlueHue', 'Calibration'],
  ['BlueSaturation', 'Calibration'],
  ['ShadowTint', 'Calibration'],
]
/** Values that count as "not changed" for the NOT_YET check (Lightroom's defaults). */
const NOT_YET_DEFAULTS: Record<string, number> = { Sharpness: 40 }

/** Read a crs setting whether it's written as an attribute or as a child element. */
function readValue(doc: Document, name: string): string | null {
  for (const el of Array.from(doc.getElementsByTagNameNS('http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'Description'))) {
    const v = el.getAttributeNS(CRS, name)
    if (v !== null && v !== '') return v
  }
  const child = doc.getElementsByTagNameNS(CRS, name)[0]
  return child && !child.children.length ? child.textContent?.trim() ?? null : null
}

function readCurve(doc: Document, name: string): Pt[] | null {
  const el = doc.getElementsByTagNameNS(CRS, name)[0]
  if (!el) return null
  const pts = Array.from(el.getElementsByTagNameNS('http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'li'))
    .map((li) => (li.textContent ?? '').split(',').map((n) => parseFloat(n)))
    .filter((p) => p.length === 2 && p.every(Number.isFinite)) as Pt[]
  return pts.length >= 2 ? pts : null
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const RANGES: Partial<Record<AdjKey, [number, number]>> = { exposure: [-5, 5], g_blending: [0, 100] }
function range(key: AdjKey): [number, number] {
  if (RANGES[key]) return RANGES[key]!
  if (key.endsWith('_hue') && key.startsWith('g_')) return [0, 360]
  if (key.endsWith('_sat') && key.startsWith('g_')) return [0, 100]
  return [-100, 100]
}

/** Parse a Lightroom / Camera Raw preset (.xmp). Throws if the file isn't one. */
export function parseXmp(text: string, fileName: string): PresetResult {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('This file is not valid XML.')
  if (!text.includes(CRS)) throw new Error("This doesn't look like a Lightroom preset (no Camera Raw settings inside).")

  const adj: Partial<Adjustments> = {}
  for (const [lr, key] of DIRECT) {
    const raw = readValue(doc, lr)
    if (raw === null) continue
    const v = parseFloat(raw)
    if (!Number.isFinite(v)) continue
    const [lo, hi] = range(key)
    adj[key] = clamp(v, lo, hi)
  }

  const curves: Partial<Curves> = {}
  const master = readCurve(doc, 'ToneCurvePV2012') ?? readCurve(doc, 'ToneCurve')
  if (master) curves.master = master
  const red = readCurve(doc, 'ToneCurvePV2012Red'), green = readCurve(doc, 'ToneCurvePV2012Green'), blue = readCurve(doc, 'ToneCurvePV2012Blue')
  if (red) curves.red = red
  if (green) curves.green = green
  if (blue) curves.blue = blue
  const splits = ['ParametricShadowSplit', 'ParametricMidtoneSplit', 'ParametricHighlightSplit'].map((n) => parseFloat(readValue(doc, n) ?? ''))
  if (splits.every(Number.isFinite)) curves.splits = splits as [number, number, number]

  const unsupported = new Set<string>()
  for (const [lr, label] of NOT_YET) {
    const v = parseFloat(readValue(doc, lr) ?? '')
    if (Number.isFinite(v) && v !== (NOT_YET_DEFAULTS[lr] ?? 0)) unsupported.add(label)
  }
  if (readValue(doc, 'Temperature') !== null && adj.temp === undefined) unsupported.add('Temperature in Kelvin (RAW files only)')

  const lookEl = doc.getElementsByTagNameNS(CRS, 'Look')[0]
  const look = lookEl?.getAttributeNS(CRS, 'Name') || lookEl?.getElementsByTagNameNS(CRS, 'Name')[0]?.textContent?.trim() || null

  const nameEl = Array.from(doc.getElementsByTagNameNS(CRS, 'Name')).find((n) => !lookEl?.contains(n))
  const presetName = nameEl?.textContent?.trim() || fileName.replace(/\.xmp$/i, '')

  // Adobe Color / Adobe Standard are Lightroom's everyday defaults, so only mention other profiles.
  const special = look && !/^Adobe (Color|Standard)$/i.test(look) ? look : null
  return { name: presetName, adj, curves, unsupported: [...unsupported], look: special }
}
