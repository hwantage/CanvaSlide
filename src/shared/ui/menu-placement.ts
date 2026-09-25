import type { Point, Rect, Size } from '../canvas/element-types'

export const MENU_EDGE_MARGIN = 4

/**
 * Keeps a menu of its natural `size` fully inside `viewport`: the anchor is pushed left/up by
 * however much would overflow, never below zero. The menu must be measured at its natural width
 * (e.g. `width: max-content`) or the clamp sees a box the browser already squeezed.
 */
export function clampMenuToViewport(
  anchor: Point,
  size: Size,
  viewport: Size,
  margin = MENU_EDGE_MARGIN
): Point {
  return {
    x: Math.max(0, Math.min(anchor.x, viewport.width - size.width - margin)),
    y: Math.max(0, Math.min(anchor.y, viewport.height - size.height - margin))
  }
}

/** Space between a popover and the control it hangs off. */
export const POPOVER_GAP = 4
export const POPOVER_EDGE_MARGIN = 8

// Why: popovers flip above their anchor near the bottom edge to stay visible.
export function placePopoverBelow(
  anchor: Rect,
  size: Size,
  viewport: Size,
  margin = POPOVER_EDGE_MARGIN,
  gap = POPOVER_GAP
): Point {
  const left = Math.max(
    margin,
    Math.min(anchor.x + anchor.width - size.width, viewport.width - size.width - margin)
  )
  const below = anchor.y + anchor.height + gap
  const top = below + size.height + margin > viewport.height ? anchor.y - size.height - gap : below
  return { x: left, y: Math.max(margin, top) }
}
