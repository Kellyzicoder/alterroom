import { vertexSrc, lumSrc, blurSrc, coeffSrc, mainSrc } from './shaders'
import { tuning, solveShoulder } from './tuning'
import { SRGB_TO_PROPHOTO, PROPHOTO_TO_SRGB, PROPHOTO_LUMA, whiteBalance, mul, columnMajor } from './color'

/** Slider values in Lightroom units. */
export type Adjustments = {
  temp: number // -100..+100 (relative, as Lightroom shows for JPEGs)
  tint: number // -100..+100
  exposure: number // -5..+5 stops
  contrast: number // -100..+100
  highlights: number
  shadows: number
  whites: number
  blacks: number
  vibrance: number
  saturation: number
}

export const defaultAdjustments: Adjustments = {
  temp: 0, tint: 0, exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, vibrance: 0, saturation: 0,
}

type Program = { prog: WebGLProgram; u: (name: string) => WebGLUniformLocation | null }
type Target = { tex: WebGLTexture; fbo: WebGLFramebuffer }

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compile failed')
  return shader
}

/**
 * Owns the WebGL context and the photo.
 * - Preview draws at screen size (fast, smooth sliders).
 * - Export and accuracy checks draw offscreen, up to full resolution.
 * - A small edge-aware brightness mask is built once per photo for Highlights / Shadows.
 */
export class Renderer {
  private gl: WebGL2RenderingContext
  private main: Program
  private lum: Program
  private blur: Program
  private coeff: Program
  private vao: WebGLVertexArrayObject
  private texture: WebGLTexture | null = null
  private mask: Target[] = [] // ping-pong targets on the small image
  private maskW = 0
  private maskH = 0
  private floatTargets: boolean
  private shoulderCache = { exposure: NaN, knee: NaN, a: 1 }
  width = 0
  height = 0

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false })
    if (!gl) throw new Error('WebGL2 is not supported in this browser')
    this.gl = gl
    // Float render targets let the mask hold log-brightness values. Almost every browser has this;
    // without it, Highlights/Shadows fall back to a simpler per-pixel version.
    this.floatTargets = !!gl.getExtension('EXT_color_buffer_float')

    this.main = this.program(mainSrc)
    this.lum = this.program(lumSrc)
    this.blur = this.program(blurSrc)
    this.coeff = this.program(coeffSrc)

    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  }

  private program(fragmentSrc: string): Program {
    const gl = this.gl
    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vertexSrc))
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fragmentSrc))
    gl.bindAttribLocation(prog, 0, 'a_pos')
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'Program link failed')
    const cache = new Map<string, WebGLUniformLocation | null>()
    return { prog, u: (n) => (cache.has(n) ? cache.get(n)! : (cache.set(n, gl.getUniformLocation(prog, n)), cache.get(n)!)) }
  }

  private target(w: number, h: number, float: boolean): Target {
    const gl = this.gl
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texStorage2D(gl.TEXTURE_2D, 1, float ? gl.RGBA16F : gl.RGBA8, w, h)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const fbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    return { tex, fbo }
  }

  private free(t: Target) {
    this.gl.deleteFramebuffer(t.fbo)
    this.gl.deleteTexture(t.tex)
  }

  /** Draw one pass into `to` (or the screen) with `input` bound to texture unit 0. */
  private pass(p: Program, to: Target | null, w: number, h: number, input: WebGLTexture | null, setup: () => void) {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, to ? to.fbo : null)
    gl.viewport(0, 0, w, h)
    gl.useProgram(p.prog)
    gl.bindVertexArray(this.vao)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, input)
    gl.uniform1i(p.u('u_flipY'), 0)
    setup()
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  get hasImage() {
    return this.texture !== null
  }

  /** Upload a photo once, then build its edge-aware brightness mask. */
  setImage(img: ImageBitmap) {
    const gl = this.gl
    const max = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), ...(gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array))
    const scale = Math.min(1, max / Math.max(img.width, img.height))
    this.width = Math.round(img.width * scale)
    this.height = Math.round(img.height * scale)

    if (this.texture) gl.deleteTexture(this.texture)
    this.texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    if (scale < 1) {
      const c = new OffscreenCanvas(this.width, this.height)
      c.getContext('2d')!.drawImage(img, 0, 0, this.width, this.height)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c)
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
    }
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    this.buildMask()
  }

  /** Guided filter on a small copy: 1 brightness pass, 2 blurs, coefficients, 2 blurs. */
  private buildMask() {
    const gl = this.gl
    this.mask.forEach((t) => this.free(t))
    this.mask = []
    if (!this.floatTargets) return
    const s = Math.min(1, tuning.maskSize / Math.max(this.width, this.height))
    const w = (this.maskW = Math.max(1, Math.round(this.width * s)))
    const h = (this.maskH = Math.max(1, Math.round(this.height * s)))
    const [A, B] = (this.mask = [this.target(w, h, true), this.target(w, h, true)])
    const r = Math.min(32, tuning.maskRadius)
    const blur = (from: Target, to: Target, dx: number, dy: number) =>
      this.pass(this.blur, to, w, h, from.tex, () => {
        gl.uniform1i(this.blur.u('u_tex'), 0)
        gl.uniform2f(this.blur.u('u_dir'), dx, dy)
        gl.uniform1i(this.blur.u('u_radius'), r)
      })

    this.pass(this.lum, A, w, h, this.texture, () => gl.uniform1i(this.lum.u('u_image'), 0))
    blur(A, B, 1, 0)
    blur(B, A, 0, 1) // A = local mean of L and L²
    this.pass(this.coeff, B, w, h, A.tex, () => {
      gl.uniform1i(this.coeff.u('u_tex'), 0)
      gl.uniform1f(this.coeff.u('u_eps'), tuning.maskEdge)
    })
    blur(B, A, 1, 0)
    blur(A, B, 0, 1) // B = smoothed coefficients, sampled by the main pass
  }

  /** Size the on-screen canvas to fit a box (CSS pixels), at screen sharpness but never bigger than the photo. */
  fitTo(boxW: number, boxH: number) {
    if (!this.width) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const fit = Math.min(boxW / this.width, boxH / this.height, 1 / dpr)
    const cssW = Math.max(1, Math.floor(this.width * fit))
    const cssH = Math.max(1, Math.floor(this.height * fit))
    this.canvas.style.width = cssW + 'px'
    this.canvas.style.height = cssH + 'px'
    this.canvas.width = Math.round(cssW * dpr)
    this.canvas.height = Math.round(cssH * dpr)
  }

  private drawMain(adj: Adjustments, bypass: boolean, to: Target | null, w: number, h: number) {
    const gl = this.gl
    const p = this.main
    if (this.shoulderCache.exposure !== adj.exposure || this.shoulderCache.knee !== tuning.knee) {
      this.shoulderCache = { exposure: adj.exposure, knee: tuning.knee, a: solveShoulder(adj.exposure, tuning.knee) }
    }
    const toWorking = mul(whiteBalance(adj.temp, adj.tint, tuning.miredPerStep, tuning.duvPerStep), SRGB_TO_PROPHOTO)
    const contrast = adj.contrast / 100
    this.pass(p, to, w, h, this.texture, () => {
      gl.uniform1i(p.u('u_flipY'), to ? 0 : 1)
      gl.uniform1i(p.u('u_image'), 0)
      const useMask = this.mask.length === 2
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, useMask ? this.mask[1].tex : null)
      gl.uniform1i(p.u('u_mask'), 1)
      gl.uniform1i(p.u('u_useMask'), useMask ? 1 : 0)
      gl.uniform1i(p.u('u_bypass'), bypass ? 1 : 0)
      gl.uniformMatrix3fv(p.u('u_toWorking'), false, columnMajor(toWorking))
      gl.uniformMatrix3fv(p.u('u_toOutput'), false, columnMajor(PROPHOTO_TO_SRGB))
      gl.uniform3f(p.u('u_luma'), ...PROPHOTO_LUMA)
      gl.uniform1f(p.u('u_exposure'), adj.exposure)
      gl.uniform1f(p.u('u_shoulderA'), this.shoulderCache.a)
      gl.uniform1f(p.u('u_knee'), tuning.knee)
      gl.uniform1f(p.u('u_shadows'), (adj.shadows / 100) * tuning.shadowsStops)
      gl.uniform1f(p.u('u_highlights'), (adj.highlights / 100) * tuning.highlightsStops)
      gl.uniform2f(p.u('u_shadowsZone'), ...tuning.shadowsZone)
      gl.uniform2f(p.u('u_highlightsZone'), ...tuning.highlightsZone)
      gl.uniform1f(p.u('u_whites'), (adj.whites / 100) * tuning.whitesStops)
      gl.uniform1f(p.u('u_blacks'), (adj.blacks / 100) * tuning.blacksStops)
      gl.uniform1f(p.u('u_whitesFrom'), tuning.whitesFrom)
      gl.uniform1f(p.u('u_blacksTo'), tuning.blacksTo)
      gl.uniform1f(p.u('u_contrast'), contrast * (contrast >= 0 ? tuning.contrastStrength : tuning.contrastStrengthNeg))
      gl.uniform1f(p.u('u_vibrance'), (adj.vibrance / 100) * tuning.vibranceStrength)
      gl.uniform1f(p.u('u_skinProtect'), tuning.skinProtect)
      gl.uniform1f(p.u('u_saturation'), (adj.saturation / 100) * (adj.saturation >= 0 ? tuning.saturationStrength : 1))
    })
    gl.activeTexture(gl.TEXTURE0)
  }

  /** Draw the preview on screen. */
  render(adj: Adjustments, bypass = false) {
    if (!this.texture) return
    this.drawMain(adj, bypass, null, this.canvas.width, this.canvas.height)
  }

  /** Render offscreen at w×h and return the pixels (RGBA, top row first). */
  renderToPixels(adj: Adjustments, w = this.width, h = this.height): Uint8ClampedArray {
    const gl = this.gl
    const t = this.target(w, h, false)
    this.drawMain(adj, false, t, w, h)
    const out = new Uint8ClampedArray(w * h * 4)
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, out)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    this.free(t)
    return out
  }

  /** Export the edit at full resolution as a JPEG. */
  async export(adj: Adjustments, quality = 0.95): Promise<Blob> {
    const px = this.renderToPixels(adj)
    const c = new OffscreenCanvas(this.width, this.height)
    c.getContext('2d')!.putImageData(new ImageData(px, this.width, this.height), 0, 0)
    return c.convertToBlob({ type: 'image/jpeg', quality })
  }
}
