import { unionRects } from './element-bounds'
import type { CanvasDocument, Point, Rect } from './element-types'

export const PASTE_CASCADE_STEP = 24

export type ObjectPastePlacement = {
  target: Point | null
  count: number
  pasteCount: number
  offset: Point
}

/** Centre the whole selection at a new target; repeated pastes there retain the familiar cascade. */
export function objectPastePlacement(
  elements: readonly Rect[],
  target: Point | null,
  previous: ObjectPastePlacement | null
): ObjectPastePlacement {
  const sameTarget =
    previous && previous.target?.x === target?.x && previous.target?.y === target?.y
  const count = sameTarget ? previous.count + 1 : 1
  const pasteCount = (previous?.pasteCount ?? 0) + 1
  const bounds = unionRects(elements)
  const step = PASTE_CASCADE_STEP * (target ? count - 1 : pasteCount)
  const offset =
    target && bounds
      ? {
          x: target.x - bounds.x - bounds.width / 2 + step,
          y: target.y - bounds.y - bounds.height / 2 + step
        }
      : { x: step, y: step }
  return { target, count, pasteCount, offset }
}

/**
 * Moves `rect` one step down-right for every element already sitting at that exact origin, so
 * repeated pastes of the same external image fan out instead of stacking invisibly.
 */
export function cascadeRect(rect: Rect, document: CanvasDocument, step = PASTE_CASCADE_STEP): Rect {
  const origins = new Set(Object.values(document.elements).map((e) => `${e.x},${e.y}`))
  let candidate = rect
  while (origins.has(`${candidate.x},${candidate.y}`)) {
    candidate = { ...candidate, x: candidate.x + step, y: candidate.y + step }
  }
  return candidate
}
