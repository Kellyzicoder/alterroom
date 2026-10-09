import type { Lut } from '../edit'

/**
 * Parse an Adobe / Resolve .cube 3D LUT.
 * Format: LUT_3D_SIZE N, optional DOMAIN_MIN / DOMAIN_MAX, then N³ lines of "r g b" with red changing fastest.
 */
export function parseCube(text: string, fileName: string): Lut {
  let size = 0
  let title = ''
  let min = [0, 0, 0], max = [1, 1, 1]
  const values: number[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.split(/\s+/)
    const word = parts[0].toUpperCase()
    if (word === 'TITLE') title = line.slice(5).trim().replace(/^"|"$/g, '')
    else if (word === 'LUT_3D_SIZE') size = parseInt(parts[1], 10)
    else if (word === 'LUT_1D_SIZE') throw new Error('This is a 1D LUT. Alterroom supports 3D LUTs (LUT_3D_SIZE).')
    else if (word === 'DOMAIN_MIN') min = parts.slice(1, 4).map(Number)
    else if (word === 'DOMAIN_MAX') max = parts.slice(1, 4).map(Number)
    else if (/^[-+.\d]/.test(word)) {
      const rgb = parts.slice(0, 3).map(Number)
      if (rgb.length === 3 && rgb.every(Number.isFinite)) values.push(...rgb)
    }
  }
  if (!size || size < 2 || size > 256) throw new Error('Missing or invalid LUT_3D_SIZE.')
  if (values.length !== size ** 3 * 3) throw new Error(`Expected ${size ** 3} colours but found ${values.length / 3}.`)
  // DOMAIN_MIN / MAX change which input colours the table covers. Almost every LUT uses 0..1.
  if (min.some((v) => v !== 0) || max.some((v) => v !== 1)) {
    throw new Error('This LUT uses a custom input range (DOMAIN_MIN / DOMAIN_MAX), which Alterroom does not support yet.')
  }
  return { name: title || fileName.replace(/\.cube$/i, ''), size, data: new Float32Array(values) }
}
