import { pinEndsOn } from '@shared/canvas/connector-geometry'
import { selectionBounds } from '@shared/canvas/element-bounds'
import {
  canRotateSelection,
  elementBox,
  elementRotation,
  normalizeRotation,
  pointerAngle,
  rectCenter,
  rotateElementAbout,
  rotationDragDelta,
  type RotatedRect
} from '@shared/canvas/element-rotation'
import type { CanvasElement, ElementId, Point } from '@shared/canvas/element-types'
import { useDocumentStore } from '@/store/document-store'
import { useInteractionOverlayStore } from '@/store/interaction-overlay-store'

export type RotateSession = {
  kind: 'rotate'
  pivot: Point
  startAngle: number
  /** The selection box the drag turns: a lone element's own box, or the group's bounds. */
  box: RotatedRect
  /** A lone element's starting angle, which Shift snaps; null for a group, whose turn snaps. */
  base: number | null
  originals: Record<ElementId, CanvasElement>
}

/** Snapshots the selection so the whole drag turns from where it started: one undo step. */
export function beginRotateSession(startWorld: Point): RotateSession | null {
  const doc = useDocumentStore.getState()
  const { document, selectedIds } = doc
  if (!canRotateSelection(document, selectedIds)) {
    return null
  }
  const only = selectedIds.length === 1 ? document.elements[selectedIds[0] as ElementId] : undefined
  const box = only ? elementBox(only) : selectionBounds(document, selectedIds)
  if (!box) {
    return null
  }
  const originals: Record<ElementId, CanvasElement> = {}
  for (const id of selectedIds) {
    const element = document.elements[id]
    if (element) {
      originals[id] = element
    }
  }
  const pivot = rectCenter(box)
  doc.beginEdit()
  // Lines attached to what turns keep their ports; the same undo step restores them.
  doc.applyLive((d) => pinEndsOn(d, selectedIds))
  return {
    kind: 'rotate',
    pivot,
    startAngle: pointerAngle(pivot, startWorld),
    box,
    base: only ? elementRotation(only) : null,
    originals
  }
}

export function applyRotateSession(session: RotateSession, world: Point, snap: boolean): void {
  const { pivot, startAngle, box, base, originals } = session
  const delta = rotationDragDelta(startAngle, pointerAngle(pivot, world), base, snap)
  useDocumentStore
    .getState()
    .patchElements(
      Object.keys(originals),
      (element) => rotateElementAbout(originals[element.id] ?? element, pivot, delta),
      false
    )
  useInteractionOverlayStore.getState().setRotationGuide({
    box: { ...box, rotation: normalizeRotation((box.rotation ?? 0) + delta) },
    degrees: normalizeRotation((base ?? 0) + delta)
  })
}
