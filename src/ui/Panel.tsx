import type { DragEvent, ReactNode } from 'react'

/** Drag-and-drop hooks for reordering, passed in by the sidebar. */
export type PanelDrag = {
  onDragStart: (e: DragEvent) => void
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
  onDragEnd: (e: DragEvent) => void
  dropBefore: boolean // show the "drop here" line above this panel
}

type Props = {
  name: string
  open: boolean
  enabled?: boolean
  changed?: boolean
  onToggleOpen: () => void
  onToggleEnabled?: () => void
  onDetach?: () => void
  drag?: PanelDrag
  children: ReactNode
}

/** A collapsible panel with a changed-dot, an eye button, and (optionally) a drag grip and a pop-out button. */
export function Panel({ name, open, enabled = true, changed = false, onToggleOpen, onToggleEnabled, onDetach, drag, children }: Props) {
  return (
    <section
      className={`panel-section ${open ? 'open' : ''} ${enabled ? '' : 'off'} ${drag?.dropBefore ? 'drop-before' : ''}`}
      onDragOver={drag?.onDragOver}
      onDrop={drag?.onDrop}
    >
      <header>
        {drag && (
          <span
            className="grip"
            draggable
            onDragStart={drag.onDragStart}
            onDragEnd={drag.onDragEnd}
            title="Drag to move this panel. Drop it on the photo to pop it out."
            aria-label={`Move ${name}`}
          >
            <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true" fill="currentColor">
              <circle cx="3" cy="3" r="1.2" /><circle cx="7" cy="3" r="1.2" />
              <circle cx="3" cy="7" r="1.2" /><circle cx="7" cy="7" r="1.2" />
              <circle cx="3" cy="11" r="1.2" /><circle cx="7" cy="11" r="1.2" />
            </svg>
          </span>
        )}
        <button className="panel-title" onClick={onToggleOpen} aria-expanded={open}>
          <svg className="chevron" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M3 1.5 6.5 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {name}
          {changed && <i className="dot" aria-label="has edits" />}
        </button>
        {onDetach && (
          <button className="eye" onClick={onDetach} title={`Pop ${name} out into its own window`} aria-label={`Pop out ${name}`}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3">
              <rect x="2" y="4.5" width="9.5" height="9.5" rx="1.5" />
              <path d="M8 2h6v6M14 2 8.5 7.5" />
            </svg>
          </button>
        )}
        {onToggleEnabled && (
          <button
            className="eye"
            onClick={onToggleEnabled}
            title={enabled ? `Turn ${name} edits off to compare` : `Turn ${name} edits back on`}
            aria-pressed={!enabled}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="8" cy="8" r="2" fill="currentColor" />
              {!enabled && <path d="M2.5 13.5 13.5 2.5" stroke="currentColor" strokeWidth="1.4" />}
            </svg>
          </button>
        )}
      </header>
      {open && <div className="panel-body">{children}</div>}
    </section>
  )
}
