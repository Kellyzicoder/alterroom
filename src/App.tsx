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
import { Filmstrip } from './ui/Filmstrip'
import { parseXmp, type PresetResult } from './io/xmp'
import { parseCube } from './io/cube'
import { MAX_PHOTOS, makeThumb, isEdited, type Photo } from './library'

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
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('beginner')
  const [openPanel, setOpenPanel] = useState<string | null>('light')
  const [disabled, setDisabled] = useState<Record<string, boolean>>({})
  const [hint, setHint] = useState<string | null>(null)
  const [mixTab, setMixTab] = useState<MixTab>('hue')
  const [gradeTab, setGradeTab] = useState<(typeof GRADE_TABS)[number]['zone']>('mid')
  const [curveTab, setCurveTab] = useState<CurveChannel>('master')
  const [preset, setPreset] = useState<PresetResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [matchOpen, setMatchOpen] = useState(false)
  const [reference, setReference] = useState<ImageBitmap | null>(null)
  const [match, setMatch] = useState<MatchResult | null>(null)

  // Photo library. The open photo's edits live in `edit`, `disabled` and `preset` above;
  // they are saved back into its library entry when you switch to another photo.
  const [photos, setPhotos] = useState<Photo[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [clipboard, setClipboard] = useState<EditState | null>(null)
  const [libraryNote, setLibraryNote] = useState<string | null>(null)
  const photosRef = useRef<Photo[]>([])
  const nextId = useRef(1)
  const loadToken = useRef(0)

  const fileName = photos.find((p) => p.id === activeId)?.name ?? null
  const live = useRef({ edit, disabled, preset, activeId })
  live.current = { edit, disabled, preset, activeId }

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

  useEffect(requestDraw, [effective, showBefore, activeId, requestDraw])

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
  }, [effective, reference, activeId])

  /** Change the library list. photosRef always holds the newest list, even before React redraws. */
  const updatePhotos = (change: (list: Photo[]) => Photo[]) => {
    photosRef.current = change(photosRef.current)
    setPhotos(photosRef.current)
  }

  /** Open a library photo in the editor, loading the edits it had. */
  async function showPhoto(id: number) {
    const r = rendererRef.current
    const wanted = photosRef.current.find((p) => p.id === id)
    if (!r || !wanted) return
    const token = ++loadToken.current
    let bitmap: ImageBitmap
    try {
      bitmap = await createImageBitmap(wanted.file)
    } catch {
      setLibraryNote(`Could not open ${wanted.name}.`)
      return
    }
    const target = photosRef.current.find((p) => p.id === id)
    if (token !== loadToken.current || !target) { // a newer pick or a remove came first
      bitmap.close()
      return
    }
    r.setImage(bitmap)
    bitmap.close()
    const stage = stageRef.current!
    r.fitTo(stage.clientWidth - 48, stage.clientHeight - 48)
    // Save the edits of the photo we are leaving, then load the edits of this one.
    const cur = live.current
    updatePhotos((list) => list.map((p) => (p.id === cur.activeId ? { ...p, edit: cur.edit, disabled: cur.disabled, preset: cur.preset } : p)))
    setReference((old) => { old?.close(); return null }) // a reference belongs to one photo
    setActiveId(id)
    setEdit(target.edit)
    setDisabled(target.disabled)
    setPreset(target.preset)
    setImportError(null)
  }

  /** Add photos to the library (up to MAX_PHOTOS). The first one opens if nothing is open yet. */
  async function addFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/'))
    let openFirst = live.current.activeId === null
    let skipped = 0
    const failed: string[] = []
    for (const file of images) {
      if (photosRef.current.length >= MAX_PHOTOS) { skipped++; continue }
      try {
        const thumb = await makeThumb(file)
        if (photosRef.current.length >= MAX_PHOTOS) { URL.revokeObjectURL(thumb); skipped++; continue }
        const id = nextId.current++
        updatePhotos((list) => [...list, { id, file, name: file.name, thumb, edit: defaultEdit, disabled: {}, preset: null }])
        if (openFirst) {
          openFirst = false
          setSelected([id])
          showPhoto(id)
        }
      } catch {
        failed.push(file.name)
      }
    }
    const parts: string[] = []
    if (skipped) parts.push(`The library holds ${MAX_PHOTOS} photos, so ${skipped} ${skipped === 1 ? 'was' : 'were'} not added.`)
    if (failed.length) parts.push(`Could not open: ${failed.join(', ')}.`)
    setLibraryNote(parts.join(' ') || null)
  }

  /** Plain click opens a photo. Ctrl/Cmd-click adds to the selection. Shift-click selects a range. */
  function pickPhoto(id: number, mods: { ctrl: boolean; shift: boolean }) {
    setLibraryNote(null)
    const list = photosRef.current
    if (mods.shift && activeId !== null) {
      const a = list.findIndex((p) => p.id === activeId)
      const b = list.findIndex((p) => p.id === id)
      setSelected(list.slice(Math.min(a, b), Math.max(a, b) + 1).map((p) => p.id))
    } else if (mods.ctrl) {
      setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
    } else {
      setSelected([id])
      if (id !== activeId) showPhoto(id)
    }
  }

  /** The open photo plus anything else selected. Paste and Remove act on these. */
  const targetIds = activeId === null ? [] : [...new Set([activeId, ...selected])]

  function copySettings() {
    setClipboard(edit)
    setLibraryNote('Settings copied.')
  }

  function pasteSettings() {
    if (!clipboard) return
    const ids = targetIds
    updatePhotos((list) => list.map((p) => (ids.includes(p.id) && p.id !== activeId ? { ...p, edit: clipboard, disabled: {}, preset: null } : p)))
    if (activeId !== null) {
      setEdit(clipboard)
      setDisabled({})
      setPreset(null)
    }
    setLibraryNote(`Pasted to ${ids.length} ${ids.length === 1 ? 'photo' : 'photos'}.`)
  }

  function removePhotos() {
    const ids = targetIds
    if (!ids.length) return
    const index = photosRef.current.findIndex((p) => p.id === activeId)
    photosRef.current.filter((p) => ids.includes(p.id)).forEach((p) => URL.revokeObjectURL(p.thumb))
    updatePhotos((list) => list.filter((p) => !ids.includes(p.id)))
    const left = photosRef.current
    loadToken.current++ // cancel a photo that was still loading
    setLibraryNote(null)
    if (left.length) {
      const next = left[Math.min(index, left.length - 1)]
      setSelected([next.id])
      showPhoto(next.id)
    } else {
      setSelected([])
      setActiveId(null)
      setEdit(defaultEdit)
      setDisabled({})
      setPreset(null)
      setReference((old) => { old?.close(); return null })
    }
  }

  function stepPhoto(by: number) {
    const list = photosRef.current
    const i = list.findIndex((p) => p.id === live.current.activeId)
    const next = list[i + by]
    if (i >= 0 && next) pickPhoto(next.id, { ctrl: false, shift: false })
  }

  // Keyboard: Ctrl/Cmd + C copies the edits, Ctrl/Cmd + V pastes them, left and right arrows change photo.
  const keys = useRef({ copySettings, pasteSettings, stepPhoto })
  keys.current = { copySettings, pasteSettings, stepPhoto }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA') return
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        if (e.key === 'c' && !window.getSelection()?.toString()) { e.preventDefault(); keys.current.copySettings() }
        if (e.key === 'v') { e.preventDefault(); keys.current.pasteSettings() }
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        if (e.key === 'ArrowLeft') keys.current.stepPhoto(-1)
        if (e.key === 'ArrowRight') keys.current.stepPhoto(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const editedIds = useMemo(
    () => new Set(photos.filter((p) => isEdited(p.id === activeId ? edit : p.edit)).map((p) => p.id)),
    [photos, activeId, edit],
  )

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
  const noPhoto = activeId === null

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

  const gradeLabel = GRADE_TABS.find((t) => t.zone === gradeTab)!.label

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
            Add photos
            <input type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
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
          const files = Array.from(e.dataTransfer.files)
          const xmp = files.find((f) => /\.xmp$/i.test(f.name))
          const cube = files.find((f) => /\.cube$/i.test(f.name))
          if (xmp) openPreset(xmp)
          else if (cube) openLut(cube)
          else addFiles(files)
        }}
      >
        {error && <p className="error">{error}</p>}
        {noPhoto && !error && (
          <div className="empty">
            <p>Drop photos here</p>
            <p className="small">or click “Add photos” at the top (up to {MAX_PHOTOS})</p>
          </div>
        )}
        <canvas ref={canvasRef} hidden={noPhoto} />
        {showBefore && fileName && <span className="badge">Original</span>}
      </main>

      {photos.length > 0 && (
        <Filmstrip
          photos={photos}
          activeId={activeId}
          selected={selected}
          edited={editedIds}
          max={MAX_PHOTOS}
          canPaste={!!clipboard}
          targetCount={targetIds.length}
          note={libraryNote}
          onPick={pickPhoto}
          onCopy={copySettings}
          onPaste={pasteSettings}
          onRemove={removePhotos}
        />
      )}

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
              {GRADE_TABS.map((t) => (
                <button key={t.zone} role="tab" aria-selected={gradeTab === t.zone} className={gradeTab === t.zone ? 'on' : ''} onClick={() => setGradeTab(t.zone)}>
                  {t.label}
                  {(adj[`g_${t.zone}_sat`] !== 0 || adj[`g_${t.zone}_lum`] !== 0) && <i className="dot" />}
                </button>
              ))}
            </div>
            <div className="wheel-wrap">
              <Wheel
                hue={adj[`g_${gradeTab}_hue`]}
                sat={adj[`g_${gradeTab}_sat`]}
                disabled={noPhoto}
                onChange={(h, s) => setEdit((e) => ({ ...e, adj: { ...e.adj, [`g_${gradeTab}_hue`]: h, [`g_${gradeTab}_sat`]: s } }))}
                onHint={setHint}
              />
              <p className="small wheel-readout">Hue {adj[`g_${gradeTab}_hue`]}° · Saturation {adj[`g_${gradeTab}_sat`]}</p>
            </div>
            {sliders([gradeLum(gradeTab, gradeLabel), ...GRADE_EXTRA])}
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
