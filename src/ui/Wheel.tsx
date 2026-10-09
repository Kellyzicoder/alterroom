import { useRef } from 'react'

type Props = {
  hue: number // 0..360
  sat: number // 0..100
  size?: number
  disabled?: boolean
  onChange: (hue: number, sat: number) => void
  onHint: (text: string | null) => void
}

/**
 * Colour wheel: drag the dot toward a colour. The angle picks the colour (hue);
 * the distance from the middle picks how strong it is (saturation). Double-click to reset.
 */
export function Wheel({ hue, sat, size = 168, disabled, onChange, onHint }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const r = size / 2

  const pick = (e: React.PointerEvent) => {
    const box = ref.current!.getBoundingClientRect()
    const dx = e.clientX - (box.left + r), dy = e.clientY - (box.top + r)
    const dist = Math.min(1, Math.hypot(dx, dy) / r)
    const angle = (Math.atan2(-dy, dx) * 180) / Math.PI
    // A small dead zone in the middle makes "no colour" easy to hit.
    onChange(Math.round((angle + 360) % 360), dist < 0.04 ? 0 : Math.round(dist * 100))
  }

  // Dot position: hue counter-clockwise from the right, like Lightroom's wheels.
  const a = (hue * Math.PI) / 180
  const x = r + Math.cos(a) * (sat / 100) * r
  const y = r - Math.sin(a) * (sat / 100) * r

  return (
    <div
      ref={ref}
      className={`wheel ${disabled ? 'disabled' : ''}`}
      style={{ width: size, height: size }}
      role="slider"
      aria-label="Colour wheel"
      aria-valuetext={`Hue ${hue}°, saturation ${sat}`}
      onPointerEnter={() => onHint('Drag toward a colour to tint this part of the photo. Further out = stronger. Double-click to reset.')}
      onPointerLeave={() => onHint(null)}
      onPointerDown={(e) => { if (disabled) return; e.currentTarget.setPointerCapture(e.pointerId); pick(e) }}
      onPointerMove={(e) => { if (!disabled && e.currentTarget.hasPointerCapture(e.pointerId)) pick(e) }}
      onDoubleClick={() => !disabled && onChange(0, 0)}
    >
      <span className="wheel-centre" />
      <span className="wheel-dot" style={{ left: x, top: y }} />
    </div>
  )
}
