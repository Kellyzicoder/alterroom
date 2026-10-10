import { useEffect, useState } from 'react'

/** Panels that can be moved, reordered and detached. */
export const PANEL_IDS = ['looks', 'light', 'colour', 'mix', 'grade', 'curve'] as const
export type PanelId = (typeof PANEL_IDS)[number]

/** Where a detached panel floats, in CSS pixels from the top-left of the window. */
export type FloatRect = { x: number; y: number; w: number; h: number }

export type Layout = {
  order: PanelId[]
  floating: Partial<Record<PanelId, FloatRect>>
  sideWidth: number
}

export const SIDE_MIN = 260
export const SIDE_MAX = 560
const KEY = 'alterroom.layout.v1'
export const defaultLayout: Layout = { order: [...PANEL_IDS], floating: {}, sideWidth: 300 }

/** Read the saved layout, ignoring anything broken or from an older version. */
function load(): Layout {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultLayout
    const saved = JSON.parse(raw) as Partial<Layout>
    const known = (saved.order ?? []).filter((id): id is PanelId => (PANEL_IDS as readonly string[]).includes(id))
    // Keep the saved order, and add any panels that were added in a newer version at the end.
    const order = [...new Set([...known, ...PANEL_IDS])]
    const floating: Layout['floating'] = {}
    for (const id of PANEL_IDS) {
      const f = saved.floating?.[id]
      if (f && [f.x, f.y, f.w, f.h].every(Number.isFinite)) floating[id] = f
    }
    const sideWidth = Math.min(SIDE_MAX, Math.max(SIDE_MIN, Number(saved.sideWidth) || defaultLayout.sideWidth))
    return { order, floating, sideWidth }
  } catch {
    return defaultLayout
  }
}

/** Layout state that is saved in the browser, so panels stay where you put them. */
export function useLayout() {
  const [layout, setLayout] = useState<Layout>(load)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(layout))
    } catch {
      // Private mode or storage full: the layout still works, it just won't be remembered.
    }
  }, [layout])
  return [layout, setLayout] as const
}

/** Keep a floating window on screen, with its title bar always reachable. */
export function clampRect(r: FloatRect): FloatRect {
  const w = Math.min(Math.max(240, r.w), window.innerWidth - 16)
  const h = Math.min(Math.max(160, r.h), window.innerHeight - 16)
  const x = Math.min(Math.max(8, r.x), window.innerWidth - w - 8)
  const y = Math.min(Math.max(8, r.y), window.innerHeight - 48)
  return { x, y, w, h }
}

/** Move `id` so it sits just before `before` (or at the end when `before` is null). */
export function reorder(order: PanelId[], id: PanelId, before: PanelId | null): PanelId[] {
  const rest = order.filter((p) => p !== id)
  const i = before ? rest.indexOf(before) : -1
  if (i < 0) return [...rest, id]
  return [...rest.slice(0, i), id, ...rest.slice(i)]
}
