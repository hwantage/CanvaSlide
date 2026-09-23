import { patchElements } from './document-mutations'
import { elementBounds, unionRects } from './element-bounds'
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

/** Aligns every selected element's visible extent to the selection's bounding box edge/center. */
export function alignElements(
  document: CanvasDocument,
  ids: readonly ElementId[],
  mode: AlignMode
): CanvasDocument {
  const elements = selected(document, ids)
  const bounds = unionRects(elements.map(elementBounds))
  if (elements.length < 2 || !bounds) {
    return document
  }
  return patchElements(
    document,
    elements.map((e) => e.id),
    (element) => {
      // Why: a rotated element's visible extent starts off its box; upright ones have no offset.
      const own = elementBounds(element)
      const dx = own.x - element.x
      const dy = own.y - element.y
      switch (mode) {
        case 'left':
          return { x: bounds.x - dx }
        case 'centerX':
          return { x: bounds.x + (bounds.width - own.width) / 2 - dx }
        case 'right':
          return { x: bounds.x + bounds.width - own.width - dx }
        case 'top':
          return { y: bounds.y - dy }
        case 'centerY':
          return { y: bounds.y + (bounds.height - own.height) / 2 - dy }
        case 'bottom':
          return { y: bounds.y + bounds.height - own.height - dy }
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
  const extents = new Map(elements.map((element) => [element.id, elementBounds(element)]))
  const extent = (element: CanvasElement) => extents.get(element.id)!
  const sorted = [...elements].sort((a, b) => extent(a)[pos] - extent(b)[pos])
  const first = extent(sorted[0] as CanvasElement)
  const last = extent(sorted.at(-1) as CanvasElement)
  const span = last[pos] + last[size] - first[pos]
  const occupied = sorted.reduce((sum, element) => sum + extent(element)[size], 0)
  const gap = (span - occupied) / (sorted.length - 1)
  const positions: Record<ElementId, number> = {}
  let cursor = first[pos]
  for (const element of sorted) {
    positions[element.id] = cursor - (extent(element)[pos] - element[pos])
    cursor += extent(element)[size] + gap
  }
  return patchElements(
    document,
    sorted.map((e) => e.id),
    (element) => ({
      [pos]: positions[element.id] ?? element[pos]
    })
  )
}
