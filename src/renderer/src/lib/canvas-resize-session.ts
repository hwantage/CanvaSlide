import { scaleConnectorWithin } from '@shared/canvas/connector-geometry'
import { selectionBounds } from '@shared/canvas/element-bounds'
import {
  elementBox,
  elementRotation,
  resizeRotatedRect,
  scaleRotatedRectWithin
} from '@shared/canvas/element-rotation'
import type { CanvasElement, ElementId, Point, Rect } from '@shared/canvas/element-types'
import { resizeRect, type HandlePosition } from '@shared/canvas/resize-handles'
import { useDocumentStore } from '@/store/document-store'

export type ResizeSession = {
  kind: 'resize'
  handle: HandlePosition
  startWorld: Point
  bounds: Rect
  originalElements: Record<ElementId, CanvasElement>
  keepAspect: boolean
  /** A lone rotated element resizes along its own axes, where its handles are drawn. */
  turned: CanvasElement | null
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
  const originalElements: Record<ElementId, CanvasElement> = {}
  let hasImage = false
  for (const id of doc.selectedIds) {
    const element = doc.document.elements[id]
    if (element) {
      originalElements[id] = element
      hasImage ||= element.type === 'image'
    }
  }
  doc.beginEdit()
  const single = doc.selectedIds.length === 1
  const keepAspect = shiftKey || (hasImage && single)
  const only = single ? Object.values(originalElements)[0] : undefined
  const turned = only && elementRotation(only) !== 0 ? only : null
  return { kind: 'resize', handle, startWorld, bounds, originalElements, keepAspect, turned }
}

export function applyResizeSession(session: ResizeSession, world: Point): void {
  const { handle, startWorld, bounds, originalElements, keepAspect, turned } = session
  const delta = { x: world.x - startWorld.x, y: world.y - startWorld.y }
  const store = useDocumentStore.getState()
  if (turned) {
    const next = resizeRotatedRect(elementBox(turned), handle, delta, { keepAspect })
    store.patchElements([turned.id], next, false)
    return
  }
  const nextBounds = resizeRect(bounds, handle, delta, { keepAspect })
  store.patchElements(
    Object.keys(originalElements),
    (element) => {
      const original = originalElements[element.id] ?? element
      if (original.type === 'connector') {
        return scaleConnectorWithin(original, bounds, nextBounds)
      }
      return scaleRotatedRectWithin(elementBox(original), bounds, nextBounds)
    },
    false
  )
}
