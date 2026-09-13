import { scaleConnectorWithin } from '@shared/canvas/connector-geometry'
import { elementRect, selectionBounds } from '@shared/canvas/element-bounds'
import type { CanvasElement, ElementId, Point, Rect } from '@shared/canvas/element-types'
import { resizeRect, scaleRectWithin, type HandlePosition } from '@shared/canvas/resize-handles'
import { useDocumentStore } from '@/store/document-store'

export type ResizeSession = {
  kind: 'resize'
  handle: HandlePosition
  startWorld: Point
  bounds: Rect
  originals: Record<ElementId, Rect>
  originalElements: Record<ElementId, CanvasElement>
  keepAspect: boolean
}

/** Snapshots the selection so every element scales proportionally inside the group bounds. */
export function beginResizeSession(
  handle: HandlePosition,
  startWorld: Point,
  shiftKey: boolean
): ResizeSession | null {
  const doc = useDocumentStore.getState()
  const bounds = selectionBounds(doc.document, doc.selectedIds)
  if (!bounds) {
    return null
  }
  const originals: Record<ElementId, Rect> = {}
  const originalElements: Record<ElementId, CanvasElement> = {}
  let hasImage = false
  for (const id of doc.selectedIds) {
    const element = doc.document.elements[id]
    if (element) {
      originals[id] = elementRect(element)
      originalElements[id] = element
      hasImage ||= element.type === 'image'
    }
  }
  doc.beginEdit()
  const keepAspect = shiftKey || (hasImage && doc.selectedIds.length === 1)
  return { kind: 'resize', handle, startWorld, bounds, originals, originalElements, keepAspect }
}

export function applyResizeSession(session: ResizeSession, world: Point): void {
  const { handle, startWorld, bounds, originals, originalElements, keepAspect } = session
  const delta = { x: world.x - startWorld.x, y: world.y - startWorld.y }
  const nextBounds = resizeRect(bounds, handle, delta, { keepAspect })
  useDocumentStore.getState().patchElements(
    Object.keys(originals),
    (element) => {
      const original = originalElements[element.id]
      if (original?.type === 'connector') {
        return scaleConnectorWithin(original, bounds, nextBounds)
      }
      return scaleRectWithin(originals[element.id] ?? elementRect(element), bounds, nextBounds)
    },
    false
  )
}
