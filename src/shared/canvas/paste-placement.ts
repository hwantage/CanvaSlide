import type { CanvasDocument, Rect } from './element-types'

export const PASTE_CASCADE_STEP = 24

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
