import { patchElements } from './document-mutations'
import { elementRect, unionRects } from './element-bounds'
import type { CanvasDocument, CanvasElement, ElementId } from './element-types'

export const alignModes = ['left', 'centerX', 'right', 'top', 'centerY', 'bottom'] as const
export type AlignMode = (typeof alignModes)[number]
export type DistributeAxis = 'x' | 'y'

// Why: connectors follow their hosts; aligning their bounding boxes would just distort them.
function selected(document: CanvasDocument, ids: readonly ElementId[]): CanvasElement[] {
  return ids.flatMap((id) => {
    const element = document.elements[id]
    return element && element.type !== 'connector' ? [element] : []
  })
}

/** Aligns every selected element to the selection's bounding box edge/center. */
export function alignElements(
  document: CanvasDocument,
  ids: readonly ElementId[],
  mode: AlignMode
): CanvasDocument {
  const elements = selected(document, ids)
  const bounds = unionRects(elements.map(elementRect))
  if (elements.length < 2 || !bounds) {
    return document
  }
  return patchElements(
    document,
    elements.map((e) => e.id),
    (element) => {
      switch (mode) {
        case 'left':
          return { x: bounds.x }
        case 'centerX':
          return { x: bounds.x + (bounds.width - element.width) / 2 }
        case 'right':
          return { x: bounds.x + bounds.width - element.width }
        case 'top':
          return { y: bounds.y }
        case 'centerY':
          return { y: bounds.y + (bounds.height - element.height) / 2 }
        case 'bottom':
          return { y: bounds.y + bounds.height - element.height }
      }
    }
  )
}

/** Equal gaps between elements along one axis; the outermost two stay put. */
export function distributeElements(
  document: CanvasDocument,
  ids: readonly ElementId[],
  axis: DistributeAxis
): CanvasDocument {
  const elements = selected(document, ids)
  if (elements.length < 3) {
    return document
  }
  const pos = axis === 'x' ? 'x' : 'y'
  const size = axis === 'x' ? 'width' : 'height'
  const sorted = [...elements].sort((a, b) => a[pos] - b[pos])
  const first = sorted[0] as CanvasElement
  const last = sorted.at(-1) as CanvasElement
  const span = last[pos] + last[size] - first[pos]
  const occupied = sorted.reduce((sum, element) => sum + element[size], 0)
  const gap = (span - occupied) / (sorted.length - 1)
  const positions: Record<ElementId, number> = {}
  let cursor = first[pos]
  for (const element of sorted) {
    positions[element.id] = cursor
    cursor += element[size] + gap
  }
  return patchElements(
    document,
    sorted.map((e) => e.id),
    (element) => ({
      [pos]: positions[element.id] ?? element[pos]
    })
  )
}
