import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Renderer, defaultAdjustments, type Adjustments } from './gl/renderer'
import { compare, referencePixels, JND, type MatchResult } from './accuracy'
import { PANELS, DEFAULT_HINT } from './ui/controls'
import { Slider } from './ui/Slider'
import { Panel } from './ui/Panel'

const COMPARE_SIZE = 800 // long side, in pixels, used for accuracy checks
type Mode = 'beginner' | 'pro'

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLElement>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const frameRef = useRef(0)
  const [adj, setAdj] = useState<Adjustments>(defaultAdjustments)
  const [showBefore, setShowBefore] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('beginner')
  const [openPanel, setOpenPanel] = useState<string | null>('light')
  const [disabled, setDisabled] = useState<Record<string, boolean>>({})
  const [hint, setHint] = useState<string | null>(null)
  const [matchOpen, setMatchOpen] = useState(false)
  const [reference, setReference] = useState<ImageBitmap | null>(null)
  const [match, setMatch] = useState<MatchResult | null>(null)

  /** What actually gets drawn: panels switched off with the eye count as zero. */
  const effective = useMemo(() => {
    const e = { ...adj }
    for (const p of PANELS) if (disabled[p.id]) for (const c of p.controls) e[c.key] = 0
    return e
  }, [adj, disabled])

  const latest = useRef({ effective, showBefore })
  latest.current = { effective, showBefore }

  /** Ask for a redraw on the next screen refresh. Many slider events in one frame = one draw. */
  const requestDraw = useCallback(() => {
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0
      rendererRef.current?.render(latest.current.effective, latest.current.showBefore)
    })
  }, [])

  useEffect(() => {
    try {
      rendererRef.current = new Renderer(canvasRef.current!)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    const stage = stageRef.current!
    const ro = new ResizeObserver(() => {
      const r = rendererRef.current
      if (!r?.hasImage) return
      r.fitTo(stage.clientWidth - 48, stage.clientHeight - 48)
      requestDraw()
    })
    ro.observe(stage)
    return () => ro.disconnect()
  }, [requestDraw])

  useEffect(requestDraw, [effective, showBefore, fileName, requestDraw])

  // Hold the backslash key to see the original (same shortcut as Lightroom's before/after).
  useEffect(() => {
    const typing = (e: KeyboardEvent) => (e.target as HTMLElement)?.tagName === 'INPUT'
    const down = (e: KeyboardEvent) => { if (e.key === '\\' && !typing(e)) setShowBefore(true) }
    const up = (e: KeyboardEvent) => { if (e.key === '\\') setShowBefore(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  // Accuracy check: runs shortly after sliders stop moving, so it never slows down dragging.
  useEffect(() => {
    const r = rendererRef.current
    if (!reference || !r?.hasImage) return setMatch(null)
    const t = setTimeout(() => {
      const scale = Math.min(1, COMPARE_SIZE / Math.max(r.width, r.height))
      const w = Math.round(r.width * scale)
      const h = Math.round(r.height * scale)
      setMatch(compare(r.renderToPixels(effective, w, h), referencePixels(reference, w, h), w, h))
    }, 150)
    return () => clearTimeout(t)
  }, [effective, reference, fileName])

  async function openFile(file: File) {
    const r = rendererRef.current
    if (!r) return
    const bitmap = await createImageBitmap(file)
    r.setImage(bitmap)
    bitmap.close()
    const stage = stageRef.current!
    r.fitTo(stage.clientWidth - 48, stage.clientHeight - 48)
    setAdj(defaultAdjustments)
    setDisabled({})
    setFileName(file.name)
  }

  async function openReference(file: File) {
    reference?.close()
    setReference(await createImageBitmap(file))
  }

  async function exportImage() {
    const r = rendererRef.current
    if (!r?.hasImage) return
    const blob = await r.export(effective)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = (fileName?.replace(/\.[^.]+$/, '') ?? 'photo') + '-alterroom.jpg'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const set = (key: keyof Adjustments, v: number) => setAdj((prev) => ({ ...prev, [key]: v }))
  const anyChanged = Object.values(adj).some((v) => v !== 0)
  const r = rendererRef.current
  const aspectMismatch = reference && r?.hasImage && Math.abs(reference.width / reference.height - r.width / r.height) > 0.01

  return (
    <div className="app">
      <header className="topbar">
        <h1>Alterroom</h1>
        <div className="mode" role="group" aria-label="Mode">
          <button className={mode === 'beginner' ? 'on' : ''} onClick={() => setMode('beginner')}>Beginner</button>
          <button className={mode === 'pro' ? 'on' : ''} onClick={() => setMode('pro')}>Pro</button>
        </div>
        <div className="actions">
          <label className="button">
            Open photo
            <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && openFile(e.target.files[0])} />
          </label>
          <button className="primary" onClick={exportImage} disabled={!fileName}>Export</button>
        </div>
      </header>

      <main
        ref={stageRef}
        className="stage"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files[0]
          if (f?.type.startsWith('image/')) openFile(f)
        }}
      >
        {error && <p className="error">{error}</p>}
        {!fileName && !error && (
          <div className="empty">
            <p>Drop a photo here</p>
            <p className="small">or click “Open photo” at the top</p>
          </div>
        )}
        <canvas ref={canvasRef} hidden={!fileName} />
        {showBefore && fileName && <span className="badge">Original</span>}
      </main>

      <aside className="side">
        <div className="side-scroll">
          {PANELS.map((p) => {
            const visible = p.controls.filter((c) => mode === 'pro' || !c.pro)
            return (
              <Panel
                key={p.id}
                name={p.name}
                open={openPanel === p.id}
                enabled={!disabled[p.id]}
                changed={p.controls.some((c) => adj[c.key] !== 0)}
                onToggleOpen={() => setOpenPanel(openPanel === p.id ? null : p.id)}
                onToggleEnabled={() => setDisabled((d) => ({ ...d, [p.id]: !d[p.id] }))}
              >
                {visible.map((c) => (
                  <Slider key={c.key} control={c} value={adj[c.key]} disabled={!fileName} onChange={(v) => set(c.key, v)} onHint={setHint} />
                ))}
                {mode === 'beginner' && visible.length < p.controls.length && (
                  <button className="link" onClick={() => setMode('pro')}>
                    Show {p.controls.length - visible.length} more in Pro
                  </button>
                )}
              </Panel>
            )
          })}

          <div className="row">
            <button
              disabled={!fileName}
              onPointerDown={() => setShowBefore(true)}
              onPointerUp={() => setShowBefore(false)}
              onPointerLeave={() => setShowBefore(false)}
            >
              Hold for original
            </button>
            <button disabled={!fileName || !anyChanged} onClick={() => { setAdj(defaultAdjustments); setDisabled({}) }}>
              Reset all
            </button>
          </div>

          <Panel name="Lightroom match" open={matchOpen} onToggleOpen={() => setMatchOpen(!matchOpen)}>
            <p className="small">Export the same photo from Lightroom or Camera Raw with the same slider values, then load it here.</p>
            <label className={`button ${fileName ? '' : 'disabled'}`}>
              {reference ? 'Change reference' : 'Load reference'}
              <input type="file" accept="image/*" hidden disabled={!fileName} onChange={(e) => e.target.files?.[0] && openReference(e.target.files[0])} />
            </label>
            {aspectMismatch && <p className="error small">Reference has a different shape. Was it cropped?</p>}
            {match && (
              <div className="score">
                <div className={`big ${match.matchPct >= 95 ? 'good' : match.matchPct >= 80 ? 'ok' : 'bad'}`}>{match.matchPct.toFixed(1)}%</div>
                <div className="small">of pixels look identical (ΔE &lt; {JND})</div>
                <div className="small">Average ΔE {match.avgDeltaE.toFixed(2)} · 95th pct {match.p95DeltaE.toFixed(2)}</div>
              </div>
            )}
          </Panel>
        </div>
        <footer className="hint" aria-live="polite">{hint ?? DEFAULT_HINT}</footer>
      </aside>
    </div>
  )
}
