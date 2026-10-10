// Runs in a headless browser: renders the photo with Alterroom's real GPU code and scores it against Lightroom.
import { Renderer } from '../../src/gl/renderer'
import { tuning } from '../../src/gl/tuning'
import { compare, referencePixels } from '../../src/accuracy'
import { defaultEdit } from '../../src/edit'

const canvas = document.createElement('canvas')
const r = new Renderer(canvas)
const base = JSON.parse(JSON.stringify(tuning))
let original: ImageBitmap
const refs = new Map<string, Uint8ClampedArray>()
let maskKey = ''

async function bitmap(url: string) {
  return createImageBitmap(await (await fetch(url)).blob(), { colorSpaceConversion: 'none' })
}

;(window as any).api = {
  /** The tuning values currently in tuning.ts. */
  tuning: () => base,
  async load(size: number, names: string[]) {
    original = await bitmap(`data/original_${size}.png`)
    r.setImage(original)
    maskKey = ''
    refs.clear()
    for (const n of names) refs.set(n, referencePixels(await bitmap(`data/${n}_${size}.png`), r.width, r.height))
    return [r.width, r.height]
  },
  /** Render with tuning overrides and slider values, and score against one reference. */
  run(patch: Record<string, unknown>, adj: Record<string, number>, ref: string) {
    Object.assign(tuning, JSON.parse(JSON.stringify(base)), patch)
    const key = JSON.stringify([tuning.maskSize, tuning.maskRadius, tuning.maskEdge])
    if (key !== maskKey) { r.setImage(original); maskKey = key }
    const px = r.renderToPixels({ ...defaultEdit, adj: { ...defaultEdit.adj, ...adj } })
    return compare(px, refs.get(ref)!, r.width, r.height)
  },
}
