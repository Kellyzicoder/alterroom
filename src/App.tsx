import { useEffect, useRef, useState } from 'react'
import { Renderer, defaultAdjustments, type Adjustments } from './gl/renderer'

const SLIDERS: { key: keyof Adjustments; label: string; min: number; max: number; step: number }[] = [
  { key: 'exposure', label: 'Exposure', min: -3, max: 3, step: 0.01 },
  { key: 'contrast', label: 'Contrast', min: -1, max: 1, step: 0.01 },
  { key: 'saturation', label: 'Saturation', min: -1, max: 1, step: 0.01 },
]

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const [adj, setAdj] = useState<Adjustments>(defaultAdjustments)
  const [showBefore, setShowBefore] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Create the WebGL renderer once the canvas exists.
  useEffect(() => {
    try {
      rendererRef.current = new Renderer(canvasRef.current!)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  // Redraw whenever a slider moves or before/after toggles.
  useEffect(() => {
    rendererRef.current?.render(adj, showBefore)
  }, [adj, showBefore, fileName])

  async function openFile(file: File) {
    const bitmap = await createImageBitmap(file)
    rendererRef.current?.setImage(bitmap)
    bitmap.close()
    setAdj(defaultAdjustments)
    setFileName(file.name)
  }

  async function exportImage() {
    const r = rendererRef.current
    if (!r?.hasImage) return
    const blob = await r.export(adj)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = (fileName?.replace(/\.[^.]+$/, '') ?? 'photo') + '-alterroom.jpg'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="app">
      <header>
        <h1>Alterroom</h1>
        <div className="actions">
          <label className="button">
            Open photo
            <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && openFile(e.target.files[0])} />
          </label>
          <button onClick={exportImage} disabled={!fileName}>Export JPG</button>
        </div>
      </header>

      <main
        className="stage"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files[0]
          if (f?.type.startsWith('image/')) openFile(f)
        }}
      >
        {error && <p className="error">{error}</p>}
        {!fileName && !error && <p className="hint">Drop a photo here or click “Open photo”</p>}
        <canvas ref={canvasRef} hidden={!fileName} />
      </main>

      <aside className="panel">
        {SLIDERS.map((s) => (
          <div className="slider" key={s.key}>
            <div className="slider-head">
              <span>{s.label}</span>
              <button className="value" onDoubleClick={() => setAdj({ ...adj, [s.key]: 0 })} title="Double-click to reset">
                {adj[s.key] > 0 ? '+' : ''}
                {adj[s.key].toFixed(2)}
              </button>
            </div>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={adj[s.key]}
              disabled={!fileName}
              onChange={(e) => setAdj({ ...adj, [s.key]: parseFloat(e.target.value) })}
            />
          </div>
        ))}

        <button
          className="compare"
          disabled={!fileName}
          onPointerDown={() => setShowBefore(true)}
          onPointerUp={() => setShowBefore(false)}
          onPointerLeave={() => setShowBefore(false)}
        >
          Hold to see original
        </button>
        <button className="reset" disabled={!fileName} onClick={() => setAdj(defaultAdjustments)}>
          Reset all
        </button>
      </aside>
    </div>
  )
}
