import type { Point, Size } from './element-types'

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
