import type { ReactNode } from 'react'

type Props = {
  name: string
  open: boolean
  enabled?: boolean
  changed?: boolean
  onToggleOpen: () => void
  onToggleEnabled?: () => void
  children: ReactNode
}

/** A collapsible panel with a changed-dot and an eye button to switch its edits off and on. */
export function Panel({ name, open, enabled = true, changed = false, onToggleOpen, onToggleEnabled, children }: Props) {
  return (
    <section className={`panel-section ${open ? 'open' : ''} ${enabled ? '' : 'off'}`}>
      <header>
        <button className="panel-title" onClick={onToggleOpen} aria-expanded={open}>
          <svg className="chevron" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M3 1.5 6.5 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {name}
          {changed && <i className="dot" aria-label="has edits" />}
        </button>
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
