import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Renderer } from './gl/renderer'
import { compare, referencePixels, JND, type MatchResult } from './accuracy'
import {
  defaultAdjustments, defaultCurves, defaultEdit, curvesChanged, HSL_COLOURS, GRADE_ZONES,
  type Adjustments, type AdjKey, type CurveChannel, type EditState,
} from './edit'
import {
  PANELS, DEFAULT_HINT, mixControls, GRADE_TABS, gradeLum, GRADE_EXTRA, CURVE_CONTROLS, LUT_AMOUNT, type MixTab, type Control,
} from './ui/controls'
import { Slider } from './ui/Slider'
import { Panel } from './ui/Panel'
import { Wheel } from './ui/Wheel'
import { CurveEditor } from './ui/CurveEditor'
import { parseXmp, type PresetResult } from './io/xmp'
import { parseCube } from './io/cube'

const COMPARE_SIZE = 800 // long side, in pixels, used for accuracy checks
type Mode = 'beginner' | 'pro'

/** Which settings belong to which panel (for the eye button, the changed-dot and reset). */
const KEYS: Record<string, AdjKey[]> = {
  light: PANELS[0].controls.map((c) => c.key),
  colour: PANELS[1].controls.map((c) => c.key),
  mix: HSL_COLOURS.flatMap((c) => [`hue_${c}`, `sat_${c}`, `lum_${c}`] as AdjKey[]),
  grade: [...GRADE_ZONES.flatMap((z) => [`g_${z}_hue`, `g_${z}_sat`, `g_${z}_lum`] as AdjKey[]), 'g_blending', 'g_balance'],
  curve: CURVE_CONTROLS.map((c) => c.key),
  looks: ['lutAmount'],
}
const keysChanged = (adj: Adjustments, keys: AdjKey[]) => keys.some((k) => adj[k] !== defaultAdjustments[k])
const CURVE_TABS: { id: CurveChannel; label: string; colour: string }[] = [
  { id: 'master', label: 'RGB', colour: '#f4f4f6' },
  { id: 'red', label: 'Red', colour: '#ff6b6b' },
  { id: 'green', label: 'Green', colour: '#5fd38a' },
  { id: 'blue', label: 'Blue', colour: '#6c9bff' },
]

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLElement>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const frameRef = useRef(0)
  const [edit, setEdit] = useState<EditState>(defaultEdit)
  const [showBefore, setShowBefore] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('beginner')
  const [openPanel, setOpenPanel] = useState<string | null>('light')
  const [disabled, setDisabled] = useState<Record<string, boolean>>({})
  const [hint, setHint] = useState<string | null>(null)
  const [mixTab, setMixTab] = useState<MixTab>('hue')
  const [gradeTab, setGradeTab] = useState<(typeof GRADE_TABS)[number]['zone'] | 'three'>('three')
  const [curveTab, setCurveTab] = useState<CurveChannel>('master')
  const [preset, setPreset] = useState<PresetResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [matchOpen, setMatchOpen] = useState(false)
  const [reference, setReference] = useState<ImageBitmap | null>(null)
  const [match, setMatch] = useState<MatchResult | null>(null)

  const { adj, curves, lut } = edit

  /** What actually gets drawn: panels switched off with the eye go back to their defaults. */
  const effective = useMemo<EditState>(() => {
    const a = { ...adj }
    for (const [id, keys] of Object.entries(KEYS)) if (disabled[id]) for (const k of keys) a[k] = defaultAdjustments[k]
    return { adj: a, curves: disabled.curve ? defaultCurves : curves, lut: disabled.looks ? null : lut }
  }, [adj, curves, lut, disabled])

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
    setEdit(defaultEdit)
    setDisabled({})
    setPreset(null)
    setFileName(file.name)
  }

  async function openPreset(file: File) {
    setImportError(null)
    try {
      const res = parseXmp(await file.text(), file.name)
      setEdit((e) => ({ ...e, adj: { ...e.adj, ...res.adj }, curves: { ...e.curves, ...res.curves } }))
      setPreset(res)
    } catch (err) {
      setImportError((err as Error).message)
    }
  }

  async function openLut(file: File) {
    setImportError(null)
    try {
      const l = parseCube(await file.text(), file.name)
      setEdit((e) => ({ ...e, lut: l }))
    } catch (err) {
      setImportError((err as Error).message)
    }
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

  const set = (key: AdjKey, v: number) => setEdit((e) => ({ ...e, adj: { ...e.adj, [key]: v } }))
  const setCurve = (ch: CurveChannel, pts: [number, number][]) => setEdit((e) => ({ ...e, curves: { ...e.curves, [ch]: pts } }))
  const anyChanged = keysChanged(adj, Object.keys(defaultAdjustments) as AdjKey[]) || curvesChanged(curves) || !!lut
  const r = rendererRef.current
  const aspectMismatch = reference && r?.hasImage && Math.abs(reference.width / reference.height - r.width / r.height) > 0.01
  const noPhoto = !fileName

  const sliders = (list: Control[]) =>
    list
      .filter((c) => mode === 'pro' || !c.pro)
      .map((c) => <Slider key={c.key} control={c} value={adj[c.key]} disabled={noPhoto} onChange={(v) => set(c.key, v)} onHint={setHint} />)

  const panelProps = (id: string, changed: boolean) => ({
    open: openPanel === id,
    enabled: !disabled[id],
    changed,
    onToggleOpen: () => setOpenPanel(openPanel === id ? null : id),
    onToggleEnabled: () => setDisabled((d) => ({ ...d, [id]: !d[id] })),
  })

  const gradeLabel = GRADE_TABS.find((t) => t.zone === gradeTab)?.label ?? ''
  const zoneChanged = (z: string) => adj[`g_${z}_sat` as AdjKey] !== 0 || adj[`g_${z}_lum` as AdjKey] !== 0
  const setWheel = (z: string, h: number, s: number) =>
    setEdit((e) => ({ ...e, adj: { ...e.adj, [`g_${z}_hue`]: h, [`g_${z}_sat`]: s } }))

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
          <button className="primary" onClick={exportImage} disabled={noPhoto}>Export</button>
        </div>
      </header>

      <main
        ref={stageRef}
        className="stage"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files[0]
          if (!f) return
          if (/\.xmp$/i.test(f.name)) openPreset(f)
          else if (/\.cube$/i.test(f.name)) openLut(f)
          else if (f.type.startsWith('image/')) openFile(f)
        }}
      >
        {error && <p className="error">{error}</p>}
        {noPhoto && !error && (
          <div className="empty">
            <p>Drop a photo here</p>
            <p className="small">or click “Open photo” at the top</p>
          </div>
        )}
        <canvas ref={canvasRef} hidden={noPhoto} />
        {showBefore && fileName && <span className="badge">Original</span>}
      </main>

      <aside className="side">
        <div className="side-scroll">
          {/* Presets and LUTs */}
          <Panel name="Presets & LUTs" {...panelProps('looks', !!lut || !!preset)}>
            <div className="row-tight">
              <label className={`button ${noPhoto ? 'disabled' : ''}`} onPointerEnter={() => setHint('Load a Lightroom preset (.xmp). Its settings fill in the sliders below, so you can still tweak them.')} onPointerLeave={() => setHint(null)}>
                Load preset (.xmp)
                <input type="file" accept=".xmp" hidden disabled={noPhoto} onChange={(e) => { if (e.target.files?.[0]) openPreset(e.target.files[0]); e.target.value = '' }} />
              </label>
              <label className={`button ${noPhoto ? 'disabled' : ''}`} onPointerEnter={() => setHint('Load a colour look (.cube LUT). It is applied last, on top of your other edits.')} onPointerLeave={() => setHint(null)}>
                Load LUT (.cube)
                <input type="file" accept=".cube" hidden disabled={noPhoto} onChange={(e) => { if (e.target.files?.[0]) openLut(e.target.files[0]); e.target.value = '' }} />
              </label>
            </div>
            {importError && <p className="error small">{importError}</p>}
            {preset && (
              <div className="note">
                <p><strong>{preset.name}</strong> applied.</p>
                {preset.unsupported.length > 0 && <p className="small">Not supported yet, so skipped: {preset.unsupported.join(', ')}.</p>}
                {preset.look && <p className="small">This preset uses the “{preset.look}” profile, which is Adobe's own data, so the look may differ.</p>}
              </div>
            )}
            {lut && (
              <>
                <div className="note row-between">
                  <span><strong>{lut.name}</strong> ({lut.size}³ LUT)</span>
                  <button className="link" onClick={() => setEdit((e) => ({ ...e, lut: null }))}>Remove</button>
                </div>
                {sliders([LUT_AMOUNT])}
              </>
            )}
          </Panel>

          {/* Light and Colour */}
          {PANELS.map((p) => {
            const visible = p.controls.filter((c) => mode === 'pro' || !c.pro)
            return (
              <Panel key={p.id} name={p.name} {...panelProps(p.id, keysChanged(adj, KEYS[p.id]))}>
                {sliders(p.controls)}
                {mode === 'beginner' && visible.length < p.controls.length && (
                  <button className="link" onClick={() => setMode('pro')}>Show {p.controls.length - visible.length} more in Pro</button>
                )}
              </Panel>
            )
          })}

          {/* Colour mix (HSL) */}
          <Panel name="Colour mix" {...panelProps('mix', keysChanged(adj, KEYS.mix))}>
            <div className="tabs" role="tablist">
              {(['hue', 'sat', 'lum'] as MixTab[]).map((t) => (
                <button key={t} role="tab" aria-selected={mixTab === t} className={mixTab === t ? 'on' : ''} onClick={() => setMixTab(t)}>
                  {t === 'hue' ? 'Hue' : t === 'sat' ? 'Saturation' : 'Luminance'}
                  {HSL_COLOURS.some((c) => adj[`${t}_${c}`] !== 0) && <i className="dot" />}
                </button>
              ))}
            </div>
            {sliders(mixControls(mixTab))}
          </Panel>

          {/* Colour grading wheels */}
          <Panel name="Colour grading" {...panelProps('grade', keysChanged(adj, KEYS.grade))}>
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={gradeTab === 'three'} aria-label="Shadows, midtones and highlights together" title="Shadows, midtones and highlights together" className={gradeTab === 'three' ? 'on' : ''} onClick={() => setGradeTab('three')}>
                <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <circle cx="8" cy="4" r="3" /><circle cx="4" cy="10" r="3" /><circle cx="12" cy="10" r="3" />
                </svg>
                {['shadow', 'mid', 'high'].some(zoneChanged) && <i className="dot" />}
              </button>
              {GRADE_TABS.map((t) => (
                <button key={t.zone} role="tab" aria-selected={gradeTab === t.zone} className={gradeTab === t.zone ? 'on' : ''} onClick={() => setGradeTab(t.zone)}>
                  {t.label}
                  {zoneChanged(t.zone) && <i className="dot" />}
                </button>
              ))}
            </div>
            {gradeTab === 'three' ? (
              // Lightroom-style layout: Midtones on top, Shadows and Highlights below.
              <div className="three-wheels">
                {(['mid', 'shadow', 'high'] as const).map((z) => (
                  <div key={z} className={`mini-wheel mini-${z}`}>
                    <span className="mini-label">{GRADE_TABS.find((t) => t.zone === z)!.label}</span>
                    <Wheel size={112} hue={adj[`g_${z}_hue`]} sat={adj[`g_${z}_sat`]} disabled={noPhoto} onChange={(h, sv) => setWheel(z, h, sv)} onHint={setHint} />
                    <input
                      type="range" min={-100} max={100} step={1} value={adj[`g_${z}_lum`]} disabled={noPhoto}
                      aria-label={`${GRADE_TABS.find((t) => t.zone === z)!.label} luminance`}
                      title={`Luminance ${adj[`g_${z}_lum`]}`}
                      style={{ ['--track' as string]: 'linear-gradient(90deg, #1c1c1e, #8e8e93 50%, #f2f2f2)' }}
                      onChange={(e) => set(`g_${z}_lum`, parseFloat(e.target.value))}
                      onDoubleClick={() => set(`g_${z}_lum`, 0)}
                      onPointerEnter={() => setHint('Luminance: makes this part of the photo brighter or darker. Double-click to reset.')}
                      onPointerLeave={() => setHint(null)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="wheel-wrap">
                  <Wheel
                    hue={adj[`g_${gradeTab}_hue`]}
                    sat={adj[`g_${gradeTab}_sat`]}
                    disabled={noPhoto}
                    onChange={(h, sv) => setWheel(gradeTab, h, sv)}
                    onHint={setHint}
                  />
                  <p className="small wheel-readout">Hue {adj[`g_${gradeTab}_hue`]}° · Saturation {adj[`g_${gradeTab}_sat`]}</p>
                </div>
                {sliders([gradeLum(gradeTab, gradeLabel)])}
              </>
            )}
            {sliders(GRADE_EXTRA)}
          </Panel>

          {/* Tone curve (Pro) */}
          {mode === 'pro' && (
            <Panel name="Tone curve" {...panelProps('curve', keysChanged(adj, KEYS.curve) || curvesChanged(curves))}>
              <div className="tabs" role="tablist">
                {CURVE_TABS.map((t) => (
                  <button key={t.id} role="tab" aria-selected={curveTab === t.id} className={curveTab === t.id ? 'on' : ''} onClick={() => setCurveTab(t.id)}>
                    {t.label}
                    {curves[t.id].length > 2 || curves[t.id].some(([x, y]) => x !== y) ? <i className="dot" /> : null}
                  </button>
                ))}
              </div>
              <CurveEditor
                points={curves[curveTab]}
                colour={CURVE_TABS.find((t) => t.id === curveTab)!.colour}
                disabled={noPhoto}
                onChange={(pts) => setCurve(curveTab, pts)}
                onHint={setHint}
              />
              {curveTab === 'master' && sliders(CURVE_CONTROLS)}
              <button className="link" disabled={noPhoto} onClick={() => setEdit((e) => ({ ...e, curves: defaultCurves, adj: { ...e.adj, curveHighlights: 0, curveLights: 0, curveDarks: 0, curveShadows: 0 } }))}>
                Reset curve
              </button>
            </Panel>
          )}
          {mode === 'beginner' && (
            <button className="link pad" onClick={() => setMode('pro')}>Tone curve is in Pro mode</button>
          )}

          <div className="row">
            <button
              disabled={noPhoto}
              onPointerDown={() => setShowBefore(true)}
              onPointerUp={() => setShowBefore(false)}
              onPointerLeave={() => setShowBefore(false)}
            >
              Hold for original
            </button>
            <button disabled={noPhoto || !anyChanged} onClick={() => { setEdit(defaultEdit); setDisabled({}); setPreset(null) }}>
              Reset all
            </button>
          </div>

          <Panel name="Lightroom match" open={matchOpen} onToggleOpen={() => setMatchOpen(!matchOpen)}>
            <p className="small">Export the same photo from Lightroom or Camera Raw with the same settings, then load it here.</p>
            <label className={`button ${noPhoto ? 'disabled' : ''}`}>
              {reference ? 'Change reference' : 'Load reference'}
              <input type="file" accept="image/*" hidden disabled={noPhoto} onChange={(e) => e.target.files?.[0] && openReference(e.target.files[0])} />
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
