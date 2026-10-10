import type { AdjKey } from '../edit'
import { HSL_COLOURS, type HslColour } from '../edit'

export type Control = {
  key: AdjKey
  label: string
  min: number
  max: number
  step: number
  digits: number
  /** One plain sentence shown when the slider is hovered. */
  help: string
  /** CSS gradient for the slider track, so the slider explains itself. */
  track?: string
  /** Hidden in Beginner mode. */
  pro?: boolean
  /** Resting value (0 if not set). Double-click resets to this. */
  def?: number
}

export type PanelDef = { id: string; name: string; controls: Control[] }

const neutral = 'linear-gradient(90deg, #4a4a50, #4a4a50)'

export const PANELS: PanelDef[] = [
  {
    id: 'light',
    name: 'Light',
    controls: [
      { key: 'exposure', label: 'Exposure', min: -5, max: 5, step: 0.01, digits: 2,
        help: 'Makes the whole photo brighter or darker.',
        track: 'linear-gradient(90deg, #1c1c1e, #8e8e93 50%, #f2f2f2)' },
      { key: 'contrast', label: 'Contrast', min: -100, max: 100, step: 1, digits: 0,
        help: 'Pushes darks darker and brights brighter. Lower it for a softer, flatter look.',
        track: 'linear-gradient(90deg, #6e6e73, #8e8e93 50%, #1c1c1e 50.5%, #f2f2f2)' },
      { key: 'highlights', label: 'Highlights', min: -100, max: 100, step: 1, digits: 0,
        help: 'Changes only the bright parts. Lower it to bring back detail in a bright sky.' },
      { key: 'shadows', label: 'Shadows', min: -100, max: 100, step: 1, digits: 0,
        help: 'Changes only the dark parts. Raise it to see detail hiding in the shadows.' },
      { key: 'whites', label: 'Whites', min: -100, max: 100, step: 1, digits: 0, pro: true,
        help: 'Sets how bright the very brightest parts get.' },
      { key: 'blacks', label: 'Blacks', min: -100, max: 100, step: 1, digits: 0, pro: true,
        help: 'Sets how dark the very darkest parts get.' },
    ],
  },
  {
    id: 'colour',
    name: 'Colour',
    controls: [
      { key: 'temp', label: 'Temperature', min: -100, max: 100, step: 1, digits: 0,
        help: 'Makes the photo cooler (blue) or warmer (yellow).',
        track: 'linear-gradient(90deg, #3b7ddd, #c9c9c9 50%, #e6b93a)' },
      { key: 'tint', label: 'Tint', min: -100, max: 100, step: 1, digits: 0, pro: true,
        help: 'Shifts colours toward green or magenta. Handy for odd indoor light.',
        track: 'linear-gradient(90deg, #3faa5a, #c9c9c9 50%, #c84fc2)' },
      { key: 'vibrance', label: 'Vibrance', min: -100, max: 100, step: 1, digits: 0,
        help: 'Boosts dull colours more than strong ones, and goes easy on skin.',
        track: 'linear-gradient(90deg, #8e8e93, #b98a8a 50%, #e0a040 75%, #50b0e0)' },
      { key: 'saturation', label: 'Saturation', min: -100, max: 100, step: 1, digits: 0,
        help: 'Makes every colour stronger or weaker. All the way left is black and white.',
        track: 'linear-gradient(90deg, #8e8e93, #d05050 55%, #e0c040 70%, #40c070 85%, #4080e0)' },
    ],
  },
]

export const NEUTRAL_TRACK = neutral

export const DEFAULT_HINT = 'Hover a slider to learn what it does. Double-click a slider to reset it. Hold \\ to see the original.'

// --- Colour mix (HSL) -------------------------------------------------------------------------

export const HSL_SWATCH: Record<HslColour, string> = {
  red: '#e0443e', orange: '#ec8b2f', yellow: '#e7cf3a', green: '#4cb050', aqua: '#3fc1c9', blue: '#3d6fe0', purple: '#8a4fd8', magenta: '#d34fb7',
}
const NAME: Record<HslColour, string> = {
  red: 'Red', orange: 'Orange', yellow: 'Yellow', green: 'Green', aqua: 'Aqua', blue: 'Blue', purple: 'Purple', magenta: 'Magenta',
}
const NEXT: Record<HslColour, HslColour> = {
  red: 'orange', orange: 'yellow', yellow: 'green', green: 'aqua', aqua: 'blue', blue: 'purple', purple: 'magenta', magenta: 'red',
}
const PREV: Record<HslColour, HslColour> = {
  red: 'magenta', orange: 'red', yellow: 'orange', green: 'yellow', aqua: 'green', blue: 'aqua', purple: 'blue', magenta: 'purple',
}
export type MixTab = 'hue' | 'sat' | 'lum'

export function mixControls(tab: MixTab): Control[] {
  return HSL_COLOURS.map((c) => {
    const base = { key: `${tab}_${c}` as AdjKey, label: NAME[c], min: -100, max: 100, step: 1, digits: 0 }
    if (tab === 'hue')
      return { ...base, help: `Shifts ${NAME[c].toLowerCase()} colours toward ${NAME[PREV[c]].toLowerCase()} (left) or ${NAME[NEXT[c]].toLowerCase()} (right).`,
        track: `linear-gradient(90deg, ${HSL_SWATCH[PREV[c]]}, ${HSL_SWATCH[c]} 50%, ${HSL_SWATCH[NEXT[c]]})` }
    if (tab === 'sat')
      return { ...base, help: `Makes ${NAME[c].toLowerCase()} colours stronger or greyer, leaving other colours alone.`,
        track: `linear-gradient(90deg, #8e8e93, ${HSL_SWATCH[c]})` }
    return { ...base, help: `Makes ${NAME[c].toLowerCase()} colours brighter or darker, leaving other colours alone.`,
      track: `linear-gradient(90deg, #1c1c1e, ${HSL_SWATCH[c]} 50%, #f2f2f2)` }
  })
}

// --- Colour grading ---------------------------------------------------------------------------

export const GRADE_TABS = [
  { zone: 'shadow', label: 'Shadows' },
  { zone: 'mid', label: 'Midtones' },
  { zone: 'high', label: 'Highlights' },
  { zone: 'global', label: 'Global' },
] as const

export const gradeLum = (zone: string, label: string): Control => ({
  key: `g_${zone}_lum` as AdjKey, label: 'Luminance', min: -100, max: 100, step: 1, digits: 0,
  help: `Makes the ${label.toLowerCase() === 'all' ? 'whole photo' : label.toLowerCase()} brighter or darker.`,
  track: 'linear-gradient(90deg, #1c1c1e, #8e8e93 50%, #f2f2f2)',
})
export const GRADE_EXTRA: Control[] = [
  { key: 'g_blending', label: 'Blending', min: 0, max: 100, step: 1, digits: 0, def: 50, pro: true,
    help: 'How much the shadow, midtone and highlight colours overlap. Higher = softer mix.' },
  { key: 'g_balance', label: 'Balance', min: -100, max: 100, step: 1, digits: 0, pro: true,
    help: 'Moves the split between shadows and highlights. Right gives highlights more of the photo.' },
]

// --- Tone curve -------------------------------------------------------------------------------

export const CURVE_CONTROLS: Control[] = [
  { key: 'curveHighlights', label: 'Highlights', min: -100, max: 100, step: 1, digits: 0, help: 'Bends the curve in the brightest quarter of tones.' },
  { key: 'curveLights', label: 'Lights', min: -100, max: 100, step: 1, digits: 0, help: 'Bends the curve in the upper-middle tones.' },
  { key: 'curveDarks', label: 'Darks', min: -100, max: 100, step: 1, digits: 0, help: 'Bends the curve in the lower-middle tones.' },
  { key: 'curveShadows', label: 'Shadows', min: -100, max: 100, step: 1, digits: 0, help: 'Bends the curve in the darkest quarter of tones.' },
]

export const LUT_AMOUNT: Control = {
  key: 'lutAmount', label: 'LUT amount', min: 0, max: 100, step: 1, digits: 0, def: 100,
  help: 'How strongly the LUT look is applied.',
}
