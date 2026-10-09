import type { Photo } from '../library'

type Props = {
  photos: Photo[]
  activeId: number | null
  selected: number[]
  edited: Set<number>
  max: number
  canPaste: boolean
  targetCount: number // how many photos Paste or Remove will act on
  note: string | null
  onPick: (id: number, mods: { ctrl: boolean; shift: boolean }) => void
  onCopy: () => void
  onPaste: () => void
  onRemove: () => void
}

/** The row of small photos under the editor, with Copy / Paste settings and Remove. */
export function Filmstrip({ photos, activeId, selected, edited, max, canPaste, targetCount, note, onPick, onCopy, onPaste, onRemove }: Props) {
  return (
    <section className="filmstrip" aria-label="Photos">
      <div className="film-head">
        <span className="small">
          {photos.length} / {max} photos
        </span>
        {note && <span className="small film-note">{note}</span>}
        <div className="film-actions">
          <button disabled={activeId === null} onClick={onCopy} title="Copy this photo's edits (Ctrl/Cmd + C)">
            Copy settings
          </button>
          <button disabled={!canPaste || activeId === null} onClick={onPaste} title="Paste the copied edits onto the selected photos (Ctrl/Cmd + V)">
            Paste{targetCount > 1 ? ` to ${targetCount}` : ''}
          </button>
          <button disabled={activeId === null} onClick={onRemove} title="Take the selected photos out of the library. The files on your computer stay as they are.">
            Remove{targetCount > 1 ? ` ${targetCount}` : ''}
          </button>
        </div>
      </div>
      <div className="strip" role="listbox" aria-multiselectable="true">
        {photos.map((p) => {
          const on = p.id === activeId
          const sel = selected.includes(p.id)
          return (
            <button
              key={p.id}
              role="option"
              aria-selected={on || sel}
              className={`thumb ${on ? 'on' : sel ? 'sel' : ''}`}
              title={`${p.name}\nClick to open. Ctrl/Cmd-click adds to the selection. Shift-click selects a range.`}
              onClick={(e) => onPick(p.id, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })}
            >
              <img src={p.thumb} alt={p.name} draggable={false} />
              {edited.has(p.id) && <i className="dot" aria-label="has edits" />}
            </button>
          )
        })}
      </div>
    </section>
  )
}
