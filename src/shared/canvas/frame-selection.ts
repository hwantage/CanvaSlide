import type { CanvasDocument, ElementId, FrameElement } from './element-types'
import { orderedFrames } from './presentation-sequence'

export function selectedFrameIds(
  document: CanvasDocument,
  selectedIds: readonly ElementId[]
): ElementId[] {
  const selected = new Set(selectedIds)
  return orderedFrames(document)
    .filter((frame) => selected.has(frame.id))
    .map((frame) => frame.id)
}

export function selectFrameInList(
  frames: readonly FrameElement[],
  selectedIds: readonly ElementId[],
  frameId: ElementId,
  anchorId: ElementId | null,
  modifiers: { range: boolean; toggle: boolean }
): { selectedIds: ElementId[]; anchorId: ElementId | null } {
  const ids = frames.map((frame) => frame.id)
  const selected = new Set(selectedIds)
  const target = ids.indexOf(frameId)
  if (target === -1) {
    return { selectedIds: [...selectedIds], anchorId }
  }
  if (modifiers.range) {
    // A canvas selection or a removed anchor starts a new range from the first selected row.
    const anchor =
      anchorId && selected.has(anchorId) && ids.includes(anchorId)
        ? anchorId
        : (ids.find((id) => selected.has(id)) ?? frameId)
    const start = ids.indexOf(anchor)
    const range = ids.slice(Math.min(start, target), Math.max(start, target) + 1)
    return {
      selectedIds: modifiers.toggle ? [...new Set([...selectedIds, ...range])] : range,
      anchorId: anchor
    }
  }
  return {
    selectedIds: modifiers.toggle
      ? selected.has(frameId)
        ? selectedIds.filter((id) => id !== frameId)
        : [...selectedIds, frameId]
      : [frameId],
    anchorId: frameId
  }
}

export function stepSelectedFrame(
  frameIds: readonly ElementId[],
  currentId: ElementId,
  direction: 1 | -1
): ElementId | null {
  const index = frameIds.indexOf(currentId)
  return index === -1 ? null : (frameIds[index + direction] ?? null)
}
