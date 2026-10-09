import { defaultAdjustments, curvesChanged, type AdjKey, type EditState } from './edit'
import type { PresetResult } from './io/xmp'

/** The most photos the library holds at once. */
export const MAX_PHOTOS = 100

/** One photo in the library. It keeps its own edits, so you can switch between photos freely. */
export type Photo = {
  id: number
  file: File // the original file; it is opened again when you pick the photo
  name: string
  thumb: string // small preview (object URL)
  edit: EditState
  disabled: Record<string, boolean> // panels switched off with the eye button
  preset: PresetResult | null
}

/** Make a small preview. Only this stays in memory, not the full photo. */
export async function makeThumb(file: File, height = 96): Promise<string> {
  const bitmap = await createImageBitmap(file, { resizeHeight: height, resizeQuality: 'medium' })
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
  bitmap.close()
  return URL.createObjectURL(await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 }))
}

/** True when the edit differs from the untouched photo. */
export function isEdited(edit: EditState): boolean {
  const keys = Object.keys(defaultAdjustments) as AdjKey[]
  return keys.some((k) => edit.adj[k] !== defaultAdjustments[k]) || curvesChanged(edit.curves) || !!edit.lut
}
