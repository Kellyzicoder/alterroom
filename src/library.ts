import type { EditState } from './edit'
import { defaultEdit } from './edit'

/** Most photos the library holds at once (like WhatsApp's limit). */
export const MAX_PHOTOS = 100
/** Long side of a thumbnail, in pixels (2× the size shown, so it stays sharp on Retina screens). */
export const THUMB_SIZE = 240

/**
 * One photo in the library. Only the File (a reference to the photo on disk) and a small thumbnail
 * are kept; the full-size pixels are only decoded for the photo being edited.
 */
export type Photo = {
  id: string
  file: File
  name: string
  thumb: string | null // object URL of a small JPEG, or null while it's being made
  edit: EditState
}

let counter = 0
export const newPhoto = (file: File): Photo => ({ id: `p${Date.now().toString(36)}${(counter++).toString(36)}`, file, name: file.name, thumb: null, edit: defaultEdit })

const isImage = (f: File) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|gif|bmp)$/i.test(f.name)
export const imageFiles = (list: FileList | File[]) => Array.from(list).filter(isImage)

async function canvasToUrl(c: OffscreenCanvas): Promise<string> {
  return URL.createObjectURL(await c.convertToBlob({ type: 'image/jpeg', quality: 0.8 }))
}

/** Small preview of the original photo, made without keeping the full-size image around. */
export async function makeThumb(file: File): Promise<string> {
  let bmp: ImageBitmap
  try {
    // Most browsers can shrink while decoding, which is much lighter on memory.
    bmp = await createImageBitmap(file, { resizeHeight: THUMB_SIZE, resizeQuality: 'medium' })
  } catch {
    bmp = await createImageBitmap(file)
  }
  const s = Math.min(1, THUMB_SIZE / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s))
  const c = new OffscreenCanvas(w, h)
  c.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  return canvasToUrl(c)
}

/** Thumbnail from already-edited pixels (RGBA, top row first). */
export async function pixelsToThumb(px: Uint8ClampedArray, w: number, h: number): Promise<string> {
  const c = new OffscreenCanvas(w, h)
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(w, h)
  img.data.set(px)
  ctx.putImageData(img, 0, 0)
  return canvasToUrl(c)
}

/** Deep-enough copy of an edit so pasting to many photos never shares one object. */
export const cloneEdit = (e: EditState): EditState => ({
  adj: { ...e.adj },
  curves: { ...e.curves, master: [...e.curves.master], red: [...e.curves.red], green: [...e.curves.green], blue: [...e.curves.blue] },
  lut: e.lut, // LUT data is read-only, so sharing it is fine (and saves memory)
})
