import {
  duplicateElements,
  patchElements,
  translateElement
} from '@shared/canvas/document-mutations'
import { elementRect, unionRects, withFrameContents } from '@shared/canvas/element-bounds'
import { constrainToAxis } from '@shared/canvas/drag-constraints'
import type { CanvasElement, ElementId, Point, Rect } from '@shared/canvas/element-types'
import { computeSnap } from '@shared/canvas/snap-guides'
import { useCameraStore } from '@/store/camera-store'
import { newElementId, useDocumentStore } from '@/store/document-store'
import { useInteractionOverlayStore } from '@/store/interaction-overlay-store'
import { SNAP_THRESHOLD_PX } from './frame-chrome'

export type MoveSession = {
  kind: 'move'
  startWorld: Point
  ids: ElementId[]
  /** Originals so moves are absolute (no drift) and connectors translate their free ends. */
  originals: Record<ElementId, CanvasElement>
  bounds: Rect
  others: Rect[]
}

/** Starts dragging the selection (or `targetId`); optionally duplicates first (⌥ / ⇧⌘ drag). */
export function beginMoveSession(
  targetId: ElementId | null,
  start: { world: Point },
  duplicate: boolean
): MoveSession {
  const doc = useDocumentStore.getState()
  let ids = targetId === null || doc.selectedIds.includes(targetId) ? doc.selectedIds : [targetId]
  ids = withFrameContents(doc.document, ids)
  doc.beginEdit()
  if (duplicate) {
    let copies: ElementId[] = []
    doc.applyLive((d) => {
      const result = duplicateElements(d, ids, newElementId, { x: 0, y: 0 })
      copies = result.newIds
      return result.document
    })
    ids = copies
  }
  doc.setSelection(ids)
  const document = useDocumentStore.getState().document
  const originals: Record<ElementId, CanvasElement> = {}
  const rects: Rect[] = []
  for (const id of ids) {
    const element = document.elements[id]
    if (element) {
      originals[id] = element
      rects.push(elementRect(element))
    }
  }
  const moving = new Set(ids)
  // Why: connectors are thin and follow hosts; they make poor snap targets.
  const others = document.order
    .filter((id) => !moving.has(id))
    .flatMap((id) => {
      const element = document.elements[id]
      return element && element.type !== 'connector' ? [elementRect(element)] : []
    })
  return {
    kind: 'move',
    startWorld: start.world,
    ids,
    originals,
    bounds: unionRects(rects) ?? { x: 0, y: 0, width: 0, height: 0 },
    others
  }
}

export type MoveModifiers = {
  /** Primary modifier: disables smart-guide snapping. */
  disableSnap: boolean
  /** Shift: locks the move to the dominant axis. */
  constrainAxis: boolean
}

/** Absolute move from the press origin so modifiers can be toggled mid-drag without drift. */
export function applyMoveSession(move: MoveSession, world: Point, modifiers: MoveModifiers): void {
  const free = { x: world.x - move.startWorld.x, y: world.y - move.startWorld.y }
  const raw = modifiers.constrainAxis ? constrainToAxis(free) : free
  const disableSnap = modifiers.disableSnap
  const zoom = useCameraStore.getState().camera.zoom
  const proposed = { ...move.bounds, x: move.bounds.x + raw.x, y: move.bounds.y + raw.y }
  const snap = disableSnap
    ? { dx: 0, dy: 0, guides: [] }
    : computeSnap(proposed, move.others, SNAP_THRESHOLD_PX / zoom)
  const delta = { x: raw.x + snap.dx, y: raw.y + snap.dy }
  useInteractionOverlayStore.getState().setSnapGuides(snap.guides)
  useDocumentStore.getState().applyLive((d) =>
    patchElements(d, move.ids, (element) => {
      const original = move.originals[element.id]
      return original ? translateElement(original, delta) : {}
    })
  )
}
