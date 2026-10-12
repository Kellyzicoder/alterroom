import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import { Panel, type PanelDrag } from './ui/Panel'
import { FloatingPanel } from './ui/FloatingPanel'
import { Filmstrip } from './ui/Filmstrip'
import { MAX_PHOTOS, newPhoto, imageFiles, makeThumb, pixelsToThumb, cloneEdit, type Photo } from './library'
import { useLayout, defaultLayout, clampRect, reorder, SIDE_MIN, SIDE_MAX, type PanelId } from './ui/layout'
import { Wheel } from './ui/Wheel'
import { CurveEditor } from './ui/CurveEditor'
import { parseXmp, type PresetResult } from './io/xmp'
import { parseCube } from './io/cube'

/** Marks a drag as one of our panels (not a photo or file). */
const PANEL_MIME = 'application/x-alterroom-panel'
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
  const pickRef = useRef<HTMLInputElement>(null)
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
  const [layout, setLayout] = useLayout()
  const [dragging, setDragging] = useState<PanelId | null>(null)
  const [dropBefore, setDropBefore] = useState<PanelId | 'end' | null>(null)
  const [front, setFront] = useState<PanelId | null>(null)
  const sideRef = useRef<HTMLElement>(null)
  const resizing = useRef(false)
  // Library
  const [photos, setPhotos] = useState<Photo[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [clipboard, setClipboard] = useState<EditState | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const loadingRef = useRef(0) // ignores a slow photo load if the user has already clicked another

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

  // Library shortcuts (Lightroom's): ← → move between photos, ⌘/Ctrl+Shift+C / V copy and paste settings,
  // ⌘/Ctrl+A select all. Kept in a ref so the listener always sees the latest state.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {})
  keys.current = (e: KeyboardEvent) => {
    const cmd = e.metaKey || e.ctrlKey
    const i = photos.findIndex((p) => p.id === activeId)
    if (!cmd && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && i >= 0) {
      const next = photos[i + (e.key === 'ArrowRight' ? 1 : -1)]
      if (next) { e.preventDefault(); setSelected(new Set()); switchTo(next.id) }
    } else if (cmd && e.shiftKey && e.key.toLowerCase() === 'c' && activeId) {
      e.preventDefault(); copySettings()
    } else if (cmd && e.shiftKey && e.key.toLowerCase() === 'v' && clipboard) {
      e.preventDefault(); paste()
    } else if (cmd && !e.shiftKey && e.key.toLowerCase() === 'a' && photos.length > 1) {
      e.preventDefault(); setSelected(new Set(photos.map((p) => p.id)))
    }
  }

  // Refresh the current photo's thumbnail so it shows the edit (shortly after sliders stop moving).
  useEffect(() => {
    const r = rendererRef.current
    if (!r?.hasImage || !activeId) return
    const id = activeId
    const t = setTimeout(async () => {
      const s = Math.min(1, 240 / Math.max(r.width, r.height))
      const w = Math.max(1, Math.round(r.width * s)), h = Math.max(1, Math.round(r.height * s))
      const thumb = await pixelsToThumb(r.renderToPixels(effective, w, h), w, h)
      setPhotos((ps) => ps.map((p) => {
        if (p.id !== id) return p
        if (p.thumb) URL.revokeObjectURL(p.thumb)
        return { ...p, thumb }
      }))
    }, 500)
    return () => clearTimeout(t)
  }, [effective, activeId])

  // Hide the little "copied / pasted" message after a few seconds.
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(t)
  }, [notice])

  // Hold the backslash key to see the original (same shortcut as Lightroom's before/after).
  useEffect(() => {
    const typing = (e: KeyboardEvent) => (e.target as HTMLElement)?.tagName === 'INPUT'
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return
      if (e.key === '\\') setShowBefore(true)
      keys.current(e)
    }
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

  /** Decode one photo at full size and make it the one being edited. */
  async function showPhoto(p: Photo) {
    const r = rendererRef.current
    if (!r) return
    const ticket = ++loadingRef.current
    const bitmap = await createImageBitmap(p.file)
    if (ticket !== loadingRef.current) { bitmap.close(); return }
    r.setImage(bitmap)
    bitmap.close()
    const stage = stageRef.current!
    r.fitTo(stage.clientWidth - 48, stage.clientHeight - 48)
    setEdit(p.edit)
    setDisabled({})
    setPreset(null)
    setActiveId(p.id)
    setFileName(p.name)
  }

  /** Save the current photo's edits back into the library (call before switching away). */
  const saveActive = (list: Photo[]) => list.map((p) => (p.id === activeId ? { ...p, edit } : p))

  /** Add photos to the library (up to MAX_PHOTOS) and make thumbnails in the background. */
  async function addPhotos(files: FileList | File[]) {
    const imgs = imageFiles(files)
    if (!imgs.length) return
    const room = MAX_PHOTOS - photos.length
    if (room <= 0) { setNotice(`The library is full (${MAX_PHOTOS} photos). Remove some to add more.`); return }
    const added = imgs.slice(0, room).map(newPhoto)
    setNotice(imgs.length > room ? `Added ${room} photos. The library holds ${MAX_PHOTOS} at most, so ${imgs.length - room} were left out.` : null)
    setPhotos((ps) => [...saveActive(ps), ...added])
    if (!activeId) await showPhoto(added[0])
    for (const p of added) {
      try {
        const thumb = await makeThumb(p.file)
        setPhotos((ps) => ps.map((q) => (q.id === p.id && !q.thumb ? { ...q, thumb } : q)))
      } catch {
        // A file that can't be decoded keeps its grey placeholder.
      }
    }
  }

  async function switchTo(id: string) {
    if (id === activeId) return
    const target = photos.find((p) => p.id === id)
    if (!target) return
    setPhotos((ps) => saveActive(ps))
    await showPhoto(target)
  }

  function removePhoto(id: string) {
    const i = photos.findIndex((p) => p.id === id)
    if (i < 0) return
    const gone = photos[i]
    if (gone.thumb) URL.revokeObjectURL(gone.thumb)
    const rest = saveActive(photos).filter((p) => p.id !== id)
    setPhotos(rest)
    setSelected((s) => { const n = new Set(s); n.delete(id); return n })
    if (id === activeId) {
      const next = rest[Math.min(i, rest.length - 1)]
      if (next) showPhoto(next)
      else { setActiveId(null); setFileName(null); setEdit(defaultEdit) }
    }
  }

  /** Click = open that photo; Ctrl/⌘-click = add to selection; Shift-click = select a range. */
  function pick(id: string, how: { add: boolean; range: boolean }) {
    if (how.add) {
      setSelected((s) => {
        const n = new Set(s.size ? s : activeId ? [activeId] : [])
        if (n.has(id)) n.delete(id); else n.add(id)
        return n
      })
      return
    }
    if (how.range && activeId) {
      const a = photos.findIndex((p) => p.id === activeId), b = photos.findIndex((p) => p.id === id)
      const [lo, hi] = a < b ? [a, b] : [b, a]
      setSelected(new Set(photos.slice(lo, hi + 1).map((p) => p.id)))
      return
    }
    setSelected(new Set())
    switchTo(id)
  }

  const copySettings = () => {
    setClipboard(cloneEdit(edit))
    setNotice('Settings copied. Pick other photos and press Paste.')
  }
  /** Paste onto the selected photos, or just the current one when nothing else is selected. */
  const pasteTo = (ids: string[]) => {
    if (!clipboard) return
    const set = new Set(ids)
    setPhotos((ps) => saveActive(ps).map((p) => (set.has(p.id) && p.id !== activeId ? { ...p, edit: cloneEdit(clipboard) } : p)))
    if (activeId && set.has(activeId)) { setEdit(cloneEdit(clipboard)); setPreset(null) }
    setNotice(`Settings pasted onto ${ids.length} photo${ids.length === 1 ? '' : 's'}.`)
  }
  const paste = () => pasteTo(selected.size > 1 ? [...selected] : activeId ? [activeId] : [])
  const pasteAll = () => pasteTo(photos.map((p) => p.id))

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


  // Every movable panel, defined once so it can live in the sidebar or in a floating window.
  const lightColour = (id: 'light' | 'colour') => {
    const p = PANELS.find((x) => x.id === id)!
    const visible = p.controls.filter((c) => mode === 'pro' || !c.pro)
    return (
      <>
        {sliders(p.controls)}
        {mode === 'beginner' && visible.length < p.controls.length && (
          <button className="link" onClick={() => setMode('pro')}>Show {p.controls.length - visible.length} more in Pro</button>
        )}
      </>
    )
  }
  const panelDefs: Record<PanelId, { name: string; changed: boolean; hidden?: boolean; body: () => ReactNode }> = {
    looks: { name: 'Presets & LUTs', changed: !!lut || !!preset, body: () => (
      <>
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
      </>
    ) },
    light: { name: 'Light', changed: keysChanged(adj, KEYS.light), body: () => lightColour('light') },
    colour: { name: 'Colour', changed: keysChanged(adj, KEYS.colour), body: () => lightColour('colour') },
    mix: { name: 'Colour mix', changed: keysChanged(adj, KEYS.mix), body: () => (
      <>
        <div className="tabs" role="tablist">
          {(['hue', 'sat', 'lum'] as MixTab[]).map((t) => (
            <button key={t} role="tab" aria-selected={mixTab === t} className={mixTab === t ? 'on' : ''} onClick={() => setMixTab(t)}>
              {t === 'hue' ? 'Hue' : t === 'sat' ? 'Saturation' : 'Luminance'}
              {HSL_COLOURS.some((c) => adj[`${t}_${c}`] !== 0) && <i className="dot" />}
            </button>
          ))}
        </div>
        {sliders(mixControls(mixTab))}
      </>
    ) },
    grade: { name: 'Colour grading', changed: keysChanged(adj, KEYS.grade), body: () => (
      <>
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
      </>
    ) },
    curve: { name: 'Tone curve', changed: keysChanged(adj, KEYS.curve) || curvesChanged(curves), hidden: mode !== 'pro', body: () => (
      <>
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
      </>
    ) },
  }

  const docked = layout.order.filter((id) => !layout.floating[id] && !panelDefs[id].hidden)
  const floatingIds = layout.order.filter((id) => layout.floating[id] && !panelDefs[id].hidden)

  /** Pop a panel out into a floating window, near (x, y) if given. */
  const detach = (id: PanelId, x?: number, y?: number) => {
    const side = sideRef.current?.getBoundingClientRect()
    const rect = clampRect({ x: x ?? (side ? side.left - 340 : 200), y: y ?? 80, w: 300, h: 460 })
    setLayout((l) => ({ ...l, floating: { ...l.floating, [id]: rect } }))
    setFront(id)
  }
  const dock = (id: PanelId) => {
    setLayout((l) => { const f = { ...l.floating }; delete f[id]; return { ...l, floating: f } })
    setOpenPanel(id)
  }
  const dragFor = (id: PanelId): PanelDrag => ({
    onDragStart: (e) => {
      e.dataTransfer.setData(PANEL_MIME, id)
      e.dataTransfer.setData('text/plain', id)
      e.dataTransfer.effectAllowed = 'move'
      setDragging(id)
    },
    onDragOver: (e) => {
      if (!dragging) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (dropBefore !== id) setDropBefore(id)
    },
    onDrop: (e) => {
      e.preventDefault()
      if (dragging && dragging !== id) setLayout((l) => ({ ...l, order: reorder(l.order, dragging, id) }))
      setDragging(null); setDropBefore(null)
    },
    onDragEnd: () => { setDragging(null); setDropBefore(null) },
    dropBefore: dropBefore === id && dragging !== null && dragging !== id,
  })

  return (
    <div className="app" style={{ gridTemplateColumns: `1fr ${layout.sideWidth}px` }}>
      <header className="topbar">
        <h1>Alterroom</h1>
        <div className="mode" role="group" aria-label="Mode">
          <button className={mode === 'beginner' ? 'on' : ''} onClick={() => setMode('beginner')}>Beginner</button>
          <button className={mode === 'pro' ? 'on' : ''} onClick={() => setMode('pro')}>Pro</button>
        </div>
        <div className="actions">
          <label className="button" title={`Add up to ${MAX_PHOTOS} photos`}>
            Add photos
            <input type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) addPhotos(e.target.files); e.target.value = '' }} />
          </label>
          <button className="primary" onClick={exportImage} disabled={noPhoto}>Export</button>
        </div>
      </header>

      {/* File picker for clicks on the empty middle area (outside <main> so its click doesn't bounce back) */}
      <input ref={pickRef} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) addPhotos(e.target.files); e.target.value = '' }} />
      <main
        ref={stageRef}
        className={`stage ${noPhoto ? 'pick' : ''}`}
        onClick={() => { if (noPhoto) pickRef.current?.click() }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const panel = (e.dataTransfer.getData(PANEL_MIME) as PanelId) || dragging
          if (panel) {
            detach(panel, e.clientX - 40, e.clientY - 16)
            setDragging(null); setDropBefore(null)
            return
          }
          const files: File[] = Array.from(e.dataTransfer.files as FileList)
          const f = files[0]
          if (!f) return
          if (/\.xmp$/i.test(f.name)) openPreset(f)
          else if (/\.cube$/i.test(f.name)) openLut(f)
          else addPhotos(files)
        }}
      >
        {error && <p className="error">{error}</p>}
        {noPhoto && !error && (
          // A real button, so Tab + Enter works too. Its click reaches the stage, which opens the file picker.
          <button type="button" className="empty">
            <p>Drop photos here</p>
            <p className="small">or click to choose them (up to {MAX_PHOTOS})</p>
          </button>
        )}
        <canvas ref={canvasRef} hidden={noPhoto} />
        {showBefore && fileName && <span className="badge">Original</span>}
        {notice && <span className="toast" role="status">{notice}</span>}
      </main>

      {photos.length > 0 && (
        <Filmstrip
          items={photos.map((p) => {
            const e = p.id === activeId ? edit : p.edit
            return { id: p.id, name: p.name, thumb: p.thumb, edited: keysChanged(e.adj, Object.keys(defaultAdjustments) as AdjKey[]) || curvesChanged(e.curves) || !!e.lut }
          })}
          activeId={activeId}
          selected={selected}
          canPaste={!!clipboard}
          onPick={pick}
          onRemove={removePhoto}
          onCopy={copySettings}
          onPaste={paste}
          onPasteAll={pasteAll}
          onSelectAll={() => setSelected(new Set(photos.map((p) => p.id)))}
          onHint={setHint}
        />
      )}

      <aside className="side" ref={sideRef}>
        <div
          className="side-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the panel area"
          title="Drag to make the panels wider or narrower. Double-click to reset."
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); resizing.current = true }}
          onPointerMove={(e) => {
            if (!resizing.current) return
            const w = Math.round(window.innerWidth - e.clientX)
            setLayout((l) => ({ ...l, sideWidth: Math.min(SIDE_MAX, Math.max(SIDE_MIN, w)) }))
          }}
          onPointerUp={() => { resizing.current = false }}
          onDoubleClick={() => setLayout((l) => ({ ...l, sideWidth: defaultLayout.sideWidth }))}
        />
        <div className="side-scroll">
          {docked.map((id) => (
            <Panel
              key={id}
              name={panelDefs[id].name}
              {...panelProps(id, panelDefs[id].changed)}
              onDetach={() => detach(id)}
              drag={dragFor(id)}
            >
              {panelDefs[id].body()}
            </Panel>
          ))}
          {/* Drop zone so a panel can be moved to the very end of the list */}
          <div
            className={`drop-end ${dragging && dropBefore === 'end' ? 'active' : ''}`}
            onDragOver={(e) => { if (!dragging) return; e.preventDefault(); if (dropBefore !== 'end') setDropBefore('end') }}
            onDrop={(e) => {
              e.preventDefault()
              if (dragging) setLayout((l) => ({ ...l, order: reorder(l.order, dragging, null) }))
              setDragging(null); setDropBefore(null)
            }}
          />
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
          <button className="link pad" onClick={() => setLayout(defaultLayout)} title="Put every panel back in the sidebar in its original order">
            Reset layout
          </button>
        </div>
        <footer className="hint" aria-live="polite">{hint ?? DEFAULT_HINT}</footer>
      </aside>

      {floatingIds.map((id) => (
        <FloatingPanel
          key={id}
          name={panelDefs[id].name}
          rect={layout.floating[id]!}
          z={front === id ? 31 : 30}
          enabled={!disabled[id]}
          changed={panelDefs[id].changed}
          onFocus={() => setFront(id)}
          onChange={(rect) => setLayout((l) => ({ ...l, floating: { ...l.floating, [id]: rect } }))}
          onDock={() => dock(id)}
          onToggleEnabled={() => setDisabled((d) => ({ ...d, [id]: !d[id] }))}
        >
          {panelDefs[id].body()}
        </FloatingPanel>
      ))}
    </div>
  )
}
