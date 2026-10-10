import { useEffect, useRef } from 'react'
import { MAX_PHOTOS } from '../library'

export type StripItem = { id: string; name: string; thumb: string | null; edited: boolean }

type Props = {
  items: StripItem[]
  activeId: string | null
  selected: Set<string>
  canPaste: boolean
  onPick: (id: string, how: { add: boolean; range: boolean }) => void
  onRemove: (id: string) => void
  onCopy: () => void
  onPaste: () => void
  onPasteAll: () => void
  onSelectAll: () => void
  onHint: (text: string | null) => void
}

const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'

/** Row of thumbnails under the photo, with copy / paste of settings. */
export function Filmstrip({ items, activeId, selected, canPaste, onPick, onRemove, onCopy, onPaste, onPasteAll, onSelectAll, onHint }: Props) {
  const stripRef = useRef<HTMLDivElement>(null)

  // Keep the active photo in view when switching with the arrow keys.
  useEffect(() => {
    stripRef.current?.querySelector('.thumb.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeId])

  const many = selected.size > 1
  const hint = (t: string) => ({ onPointerEnter: () => onHint(t), onPointerLeave: () => onHint(null) })

  return (
    <section className="filmstrip" aria-label="Photo library">
      <div className="filmstrip-bar">
        <span className="small">
          {items.length} / {MAX_PHOTOS} photos{many ? ` · ${selected.size} selected` : ''}
        </span>
        <div className="filmstrip-actions">
          <button {...hint(`Copy this photo's settings (${mod}Shift+C).`)} onClick={onCopy} disabled={!activeId}>Copy settings</button>
          <button {...hint(`Paste the copied settings onto ${many ? 'the selected photos' : 'this photo'} (${mod}Shift+V).`)} onClick={onPaste} disabled={!canPaste}>
            {many ? `Paste to ${selected.size}` : 'Paste'}
          </button>
          <button {...hint('Paste the copied settings onto every photo in the library.')} onClick={onPasteAll} disabled={!canPaste || items.length < 2}>Paste to all</button>
          <button {...hint(`Select every photo (${mod}A). ${mod}-click or Shift-click thumbnails to pick a few.`)} onClick={onSelectAll} disabled={items.length < 2}>Select all</button>
        </div>
      </div>
      <div className="filmstrip-row" ref={stripRef} role="listbox" aria-label="Photos" aria-multiselectable="true">
        {items.map((p, i) => (
          <div
            key={p.id}
            role="option"
            aria-selected={selected.has(p.id)}
            className={`thumb ${p.id === activeId ? 'active' : ''} ${selected.has(p.id) ? 'selected' : ''}`}
            title={`${i + 1}. ${p.name}`}
            onClick={(e) => onPick(p.id, { add: e.metaKey || e.ctrlKey, range: e.shiftKey })}
          >
            {p.thumb ? <img src={p.thumb} alt={p.name} draggable={false} /> : <span className="thumb-loading" />}
            {p.edited && <i className="dot thumb-dot" aria-label="edited" />}
            <button
              className="thumb-remove"
              aria-label={`Remove ${p.name} from the library`}
              title="Remove from the library (the file on your computer is not touched)"
              onClick={(e) => { e.stopPropagation(); onRemove(p.id) }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
