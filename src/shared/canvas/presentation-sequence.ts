import type { CanvasDocument, ElementId, FrameElement } from './element-types'

/** Frames in presentation order (order asc, then z-order as tiebreak). */
export function orderedFrames(document: CanvasDocument): FrameElement[] {
  const frames: FrameElement[] = []
  for (const id of document.order) {
    const element = document.elements[id]
    if (element?.type === 'frame') {
      frames.push(element)
    }
  }
  return frames.sort((a, b) => a.order - b.order)
}

export function nextFrameOrder(document: CanvasDocument): number {
  const frames = orderedFrames(document)
  const last = frames.at(-1)
  return last ? last.order + 1 : 1
}

export function frameIndexById(frames: readonly FrameElement[], id: ElementId): number {
  return frames.findIndex((f) => f.id === id)
}

/** Returns `order` values renumbered 1..n after moving `id` one step. */
export function moveFrameInSequence(
  frames: readonly FrameElement[],
  id: ElementId,
  direction: 'up' | 'down'
): Record<ElementId, number> {
  const ids = frames.map((f) => f.id)
  const index = ids.indexOf(id)
  if (index === -1) {
    return {}
  }
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= ids.length) {
    return {}
  }
  const swapped = [...ids]
  swapped[index] = ids[target] as ElementId
  swapped[target] = id
  return Object.fromEntries(swapped.map((frameId, i) => [frameId, i + 1]))
}

/** Moves `id` to `targetIndex` in the sequence and renumbers 1..n. */
export function moveFrameToIndex(
  frames: readonly FrameElement[],
  id: ElementId,
  targetIndex: number
): Record<ElementId, number> {
  const ids = frames.map((f) => f.id)
  const from = ids.indexOf(id)
  const to = Math.min(ids.length - 1, Math.max(0, targetIndex))
  if (from === -1 || from === to) {
    return {}
  }
  const reordered = ids.filter((frameId) => frameId !== id)
  reordered.splice(to, 0, id)
  return Object.fromEntries(reordered.map((frameId, i) => [frameId, i + 1]))
}

/**
 * A drop *between* rows is a gap 0..n over the list as displayed; once the dragged row leaves
 * its old place, gaps past it shift down by one.
 */
export function gapToIndex(from: number, gap: number): number {
  return gap > from ? gap - 1 : gap
}

export function clampFrameIndex(index: number, count: number): number {
  if (count <= 0) {
    return 0
  }
  return Math.min(count - 1, Math.max(0, index))
}

export function stepFrameIndex(index: number, count: number, step: 1 | -1): number {
  return clampFrameIndex(index + step, count)
}

export function defaultFrameName(order: number): string {
  return `Frame ${order}`
}
