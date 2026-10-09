import { useRef, useState } from 'react'
import type { Pt } from '../edit'
import { spline } from '../gl/curve'

type Props = {
  points: Pt[]
  colour: string
  disabled?: boolean
  onChange: (points: Pt[]) => void
  onHint: (text: string | null) => void
}

const SIZE = 248 // drawing size; points live on Lightroom's 0..255 grid
const PAD = 8 // room around the edge so end points aren't cut off

/** Point curve: click to add a point, drag to move it, double-click a point to remove it. */
export function CurveEditor({ points, colour, disabled, onChange, onHint }: Props) {
  const ref = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const sorted = [...points].sort((a, b) => a[0] - b[0])

  const toGrid = (e: { clientX: number; clientY: number }): Pt => {
    const box = ref.current!.getBoundingClientRect()
    const full = SIZE + PAD * 2
    const gx = Math.round(((((e.clientX - box.left) / box.width) * full - PAD) / SIZE) * 255)
    const gy = Math.round((1 - (((e.clientY - box.top) / box.height) * full - PAD) / SIZE) * 255)
    return [Math.min(255, Math.max(0, gx)), Math.min(255, Math.max(0, gy))]
  }
  const px = ([x, y]: Pt) => [(x / 255) * SIZE, (1 - y / 255) * SIZE] as const

  // Draw the same smooth curve the GPU uses, sampled at 64 steps.
  const f = spline(sorted)
  const path = Array.from({ length: 65 }, (_, i) => {
    const x = i / 64
    const y = Math.min(1, Math.max(0, f(x)))
    return `${i ? 'L' : 'M'}${x * SIZE} ${(1 - y) * SIZE}`
  }).join(' ')

  const move = (e: React.PointerEvent) => {
    if (drag === null || disabled) return
    const [x, y] = toGrid(e)
    const next = sorted.map((p) => [...p] as Pt)
    const lo = drag === 0 ? 0 : next[drag - 1][0] + 1
    const hi = drag === next.length - 1 ? 255 : next[drag + 1][0] - 1
    // The two end points can move up and down but stay at the left and right edges.
    next[drag] = [drag === 0 ? 0 : drag === next.length - 1 ? 255 : Math.min(hi, Math.max(lo, x)), y]
    onChange(next)
  }

  return (
    <svg
      ref={ref}
      className={`curve ${disabled ? 'disabled' : ''}`}
      viewBox={`${-PAD} ${-PAD} ${SIZE + PAD * 2} ${SIZE + PAD * 2}`}
      width="100%"
      onPointerEnter={() => onHint('Click the line to add a point, drag to bend it, double-click a point to remove it.')}
      onPointerLeave={() => onHint(null)}
      onPointerDown={(e) => {
        if (disabled) return
        const p = toGrid(e)
        e.currentTarget.setPointerCapture(e.pointerId)
        // Grab a nearby point, or add a new one at the pointer.
        const near = sorted.findIndex(([x, y]) => Math.hypot(x - p[0], y - p[1]) < 12)
        if (near >= 0) return setDrag(near)
        if (p[0] <= 0 || p[0] >= 255) return
        const next = [...sorted, p].sort((a, b) => a[0] - b[0])
        onChange(next)
        setDrag(next.findIndex((q) => q === p))
      }}
      onPointerMove={move}
      onPointerUp={() => setDrag(null)}
      onDoubleClick={(e) => {
        if (disabled) return
        const p = toGrid(e)
        const near = sorted.findIndex(([x, y]) => Math.hypot(x - p[0], y - p[1]) < 12)
        if (near > 0 && near < sorted.length - 1) onChange(sorted.filter((_, i) => i !== near))
      }}
    >
      {[1, 2, 3].map((i) => (
        <g key={i} stroke="#ffffff14">
          <line x1={(i * SIZE) / 4} y1="0" x2={(i * SIZE) / 4} y2={SIZE} />
          <line x1="0" y1={(i * SIZE) / 4} x2={SIZE} y2={(i * SIZE) / 4} />
        </g>
      ))}
      <line x1="0" y1={SIZE} x2={SIZE} y2="0" stroke="#ffffff22" strokeDasharray="3 4" />
      <path d={path} fill="none" stroke={colour} strokeWidth="1.75" />
      {sorted.map((p, i) => {
        const [cx, cy] = px(p)
        return <circle key={i} cx={cx} cy={cy} r={drag === i ? 6 : 4.5} fill="#f4f4f6" stroke="#000a" />
      })}
    </svg>
  )
}
