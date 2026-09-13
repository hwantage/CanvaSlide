import type { Point } from './element-types'

/**
 * Shift while drawing: the far corner is pulled onto the diagonal so the rect becomes a square
 * (or the ellipse a circle). The larger extent wins so the shape never shrinks under the cursor.
 */
export function constrainToSquare(start: Point, end: Point): Point {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const extent = Math.max(Math.abs(dx), Math.abs(dy))
  return {
    x: start.x + Math.sign(dx || 1) * extent,
    y: start.y + Math.sign(dy || 1) * extent
  }
}

/** Shift while moving: the drag is locked to whichever axis it has travelled further along. */
export function constrainToAxis(delta: Point): Point {
  return Math.abs(delta.x) >= Math.abs(delta.y) ? { x: delta.x, y: 0 } : { x: 0, y: delta.y }
}
