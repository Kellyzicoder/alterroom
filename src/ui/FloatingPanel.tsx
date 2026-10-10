import { useEffect, useRef, type ReactNode } from 'react'
import { clampRect, type FloatRect } from './layout'

type Props = {
  name: string
  rect: FloatRect
  z: number
  enabled: boolean
  changed: boolean
  onFocus: () => void
  onChange: (rect: FloatRect) => void
  onDock: () => void
  onToggleEnabled: () => void
  children: ReactNode
}

/**
 * A detached panel: drag its title bar to move it, drag the bottom-right corner to resize it,
 * and use the dock button to put it back in the sidebar.
 */
export function FloatingPanel({ name, rect, z, enabled, changed, onFocus, onChange, onDock, onToggleEnabled, children }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const latest = useRef(rect)
  latest.current = rect

  // Notice when the user resizes the window with its corner handle.
  useEffect(() => {
    const el = ref.current!
    const ro = new ResizeObserver(() => {
      const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight)
      if (Math.abs(w - latest.current.w) > 1 || Math.abs(h - latest.current.h) > 1) onChange({ ...latest.current, w, h })
    })
    ro.observe(el)
    return () => ro.disconnect()
    // onChange changes every render; the observer only needs the latest rect, read from the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={ref}
      className={`floating ${enabled ? '' : 'off'}`}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex: z }}
      role="dialog"
      aria-label={`${name} panel`}
      onPointerDown={onFocus}
    >
      <header
        className="floating-bar"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { dx: e.clientX - rect.x, dy: e.clientY - rect.y }
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          onChange(clampRect({ ...rect, x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy }))
        }}
        onPointerUp={() => { drag.current = null }}
        onDoubleClick={onDock}
        title="Drag to move. Double-click to put it back in the sidebar."
      >
        <span className="floating-title">
          {name}
          {changed && <i className="dot" aria-label="has edits" />}
        </span>
        <button className="eye" onClick={onToggleEnabled} title={enabled ? `Turn ${name} edits off to compare` : `Turn ${name} edits back on`} aria-pressed={!enabled}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="8" cy="8" r="2" fill="currentColor" />
            {!enabled && <path d="M2.5 13.5 13.5 2.5" stroke="currentColor" strokeWidth="1.4" />}
          </svg>
        </button>
        <button className="eye" onClick={onDock} title="Put back in the sidebar" aria-label={`Dock ${name}`}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3">
            <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
            <path d="M10 2.5v11" />
            <path d="M7.5 8H4.5M6 6.5 4.5 8 6 9.5" />
          </svg>
        </button>
      </header>
      <div className="floating-body">{children}</div>
    </div>
  )
}
