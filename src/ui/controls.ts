import type { Adjustments } from '../gl/renderer'

export type Control = {
  key: keyof Adjustments
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
