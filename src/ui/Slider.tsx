import type { Control } from './controls'
import { NEUTRAL_TRACK } from './controls'

type Props = {
  control: Control
  value: number
  disabled: boolean
  onChange: (v: number) => void
  onHint: (text: string | null) => void
}

/** One labelled slider: coloured track, typed value, dot when changed, double-click to reset. */
export function Slider({ control: c, value, disabled, onChange, onHint }: Props) {
  const changed = value !== 0
  const shown = Number(value.toFixed(c.digits))
  return (
    <div
      className="slider"
      onPointerEnter={() => onHint(c.help)}
      onPointerLeave={() => onHint(null)}
    >
      <div className="slider-head">
        <span className="label" onDoubleClick={() => onChange(0)}>
          {c.label}
          {changed && <i className="dot" aria-label="changed" />}
        </span>
        <input
          className="value"
          type="number"
          min={c.min}
          max={c.max}
          step={c.step}
          value={shown}
          disabled={disabled}
          aria-label={`${c.label} value`}
          onFocus={() => onHint(c.help)}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!Number.isNaN(v)) onChange(Math.min(c.max, Math.max(c.min, v)))
          }}
        />
      </div>
      <input
        type="range"
        min={c.min}
        max={c.max}
        step={c.step}
        value={value}
        disabled={disabled}
        aria-label={c.label}
        style={{ ['--track' as string]: c.track ?? NEUTRAL_TRACK }}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onDoubleClick={() => onChange(0)}
      />
    </div>
  )
}
