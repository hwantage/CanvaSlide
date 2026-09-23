import type { Point, Rect } from './element-types'

export const handlePositions = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
export type HandlePosition = (typeof handlePositions)[number]

export const MIN_ELEMENT_SIZE = 8

/** Grows a drawn rect to the minimum size; a purely vertical/horizontal drag must not yield 0. */
export function clampRectSize(rect: Rect, minSize = MIN_ELEMENT_SIZE): Rect {
  const width = Math.max(minSize, rect.width)
  const height = Math.max(minSize, rect.height)
  return width === rect.width && height === rect.height ? rect : { ...rect, width, height }
}

/** Compass direction of each handle, clockwise from north. */
const handleDegrees: Record<HandlePosition, number> = {
  n: 0,
  ne: 45,
  e: 90,
  se: 135,
  s: 180,
  sw: 225,
  w: 270,
  nw: 315
}

const resizeCursors = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'] as const

/** Resize cursor for a handle on a box turned `rotation` degrees, to the nearest 45°. */
export function handleCursor(handle: HandlePosition, rotation = 0): string {
  const step = Math.round((handleDegrees[handle] + rotation) / 45)
  return resizeCursors[((step % 4) + 4) % 4] as string
}

export function handleAnchorPoints(rect: Rect): Record<HandlePosition, Point> {
  const { x, y, width, height } = rect
  return {
    nw: { x, y },
    n: { x: x + width / 2, y },
    ne: { x: x + width, y },
    e: { x: x + width, y: y + height / 2 },
    se: { x: x + width, y: y + height },
    s: { x: x + width / 2, y: y + height },
    sw: { x, y: y + height },
    w: { x, y: y + height / 2 }
  }
}

export type ResizeOptions = { keepAspect?: boolean; minSize?: number }

/** Applies a world-space drag delta to one handle of `rect`; the opposite edge stays fixed. */
export function resizeRect(
  rect: Rect,
  handle: HandlePosition,
  delta: Point,
  options: ResizeOptions = {}
): Rect {
  const minSize = options.minSize ?? MIN_ELEMENT_SIZE
  let left = rect.x
  let top = rect.y
  let right = rect.x + rect.width
  let bottom = rect.y + rect.height

  if (handle.includes('w')) {
    left = Math.min(left + delta.x, right - minSize)
  }
  if (handle.includes('e')) {
    right = Math.max(right + delta.x, left + minSize)
  }
  if (handle.includes('n')) {
    top = Math.min(top + delta.y, bottom - minSize)
  }
  if (handle.includes('s')) {
    bottom = Math.max(bottom + delta.y, top + minSize)
  }

  let next: Rect = { x: left, y: top, width: right - left, height: bottom - top }
  if (options.keepAspect && rect.width > 0 && rect.height > 0) {
    next = constrainAspect(rect, next, handle)
  }
  return next
}

function constrainAspect(original: Rect, next: Rect, handle: HandlePosition): Rect {
  const aspect = original.width / original.height
  const horizontalOnly = handle === 'e' || handle === 'w'
  const verticalOnly = handle === 'n' || handle === 's'
  let width = next.width
  let height = next.height
  if (horizontalOnly) {
    height = width / aspect
  } else if (verticalOnly) {
    width = height * aspect
  } else if (Math.abs(next.width - original.width) >= Math.abs(next.height - original.height)) {
    height = width / aspect
  } else {
    width = height * aspect
  }
  // Why: the edge opposite the dragged handle stays anchored, same as the unconstrained path.
  const x = handle.includes('w') ? original.x + original.width - width : original.x
  const y = handle.includes('n') ? original.y + original.height - height : original.y
  return { x, y, width, height }
}

/** Scales every rect in a group so the group bounds go from `from` to `to`. */
export function scaleRectWithin(rect: Rect, from: Rect, to: Rect): Rect {
  const sx = from.width === 0 ? 1 : to.width / from.width
  const sy = from.height === 0 ? 1 : to.height / from.height
  return {
    x: to.x + (rect.x - from.x) * sx,
    y: to.y + (rect.y - from.y) * sy,
    width: rect.width * sx,
    height: rect.height * sy
  }
}
