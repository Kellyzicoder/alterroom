import { vertexSrc, fragmentSrc } from './shaders'

export type Adjustments = {
  exposure: number
  contrast: number
  saturation: number
}

export const defaultAdjustments: Adjustments = { exposure: 0, contrast: 0, saturation: 0 }

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compile failed')
  }
  return shader
}

/** Owns the WebGL context, the uploaded photo texture, and draws it with adjustments. */
export class Renderer {
  private gl: WebGL2RenderingContext
  private program: WebGLProgram
  private texture: WebGLTexture | null = null
  private uniforms: Record<string, WebGLUniformLocation | null>

  constructor(private canvas: HTMLCanvasElement) {
    // preserveDrawingBuffer lets us read the pixels back for export.
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true })
    if (!gl) throw new Error('WebGL2 is not supported in this browser')
    this.gl = gl

    const program = gl.createProgram()!
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertexSrc))
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentSrc))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? 'Program link failed')
    }
    this.program = program
    gl.useProgram(program)

    // Two triangles covering the whole canvas.
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(program, 'a_pos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    this.uniforms = Object.fromEntries(
      ['u_image', 'u_exposure', 'u_contrast', 'u_saturation', 'u_bypass'].map((n) => [n, gl.getUniformLocation(program, n)]),
    )
  }

  /** Upload a photo to the GPU. Large photos are scaled to fit the GPU's texture limit. */
  setImage(img: HTMLImageElement | ImageBitmap) {
    const gl = this.gl
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
    const scale = Math.min(1, max / Math.max(img.width, img.height))
    this.canvas.width = Math.round(img.width * scale)
    this.canvas.height = Math.round(img.height * scale)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)

    if (this.texture) gl.deleteTexture(this.texture)
    this.texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
  }

  get hasImage() {
    return this.texture !== null
  }

  render(adj: Adjustments, bypass = false) {
    if (!this.texture) return
    const gl = this.gl
    gl.useProgram(this.program)
    gl.uniform1i(this.uniforms.u_image, 0)
    gl.uniform1f(this.uniforms.u_exposure, adj.exposure)
    gl.uniform1f(this.uniforms.u_contrast, adj.contrast)
    gl.uniform1f(this.uniforms.u_saturation, adj.saturation)
    gl.uniform1i(this.uniforms.u_bypass, bypass ? 1 : 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  /** Export the current edit as a JPEG. */
  export(adj: Adjustments, quality = 0.92): Promise<Blob> {
    this.render(adj, false)
    return new Promise((resolve, reject) =>
      this.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), 'image/jpeg', quality),
    )
  }
}
