import type { CanvasDocument, ElementId, Rect } from './element-types'

/** Breathing room between the wrapped content and the new frame's edge, in world units. */
export const FRAME_FROM_SELECTION_PADDING = 48

/** Rect for a presentation frame that wraps `bounds` with equal padding on every side. */
export function frameRectAround(bounds: Rect, padding = FRAME_FROM_SELECTION_PADDING): Rect {
  return {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2
  }
}

/**
 * True when something is selected and all of it is frames. Frames sit beneath content and carry the
 * deck's order, so the commands that reshuffle or wrap content have nothing to do for them.
 */
export function selectionIsOnlyFrames(
  document: CanvasDocument,
  selectedIds: readonly ElementId[]
): boolean {
  const selected = selectedIds.flatMap((id) => document.elements[id] ?? [])
  return selected.length > 0 && selected.every((element) => element.type === 'frame')
}
