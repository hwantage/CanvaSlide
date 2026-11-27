import {
  duplicateElements,
  patchElements,
  translateElement
} from '@shared/canvas/document-mutations'
import { elementBounds, unionRects } from '@shared/canvas/element-bounds'
import { withFrameContents } from '@shared/canvas/frame-contents'
import { constrainToAxis } from '@shared/canvas/drag-constraints'
import type { CanvasElement, ElementId, Point, Rect } from '@shared/canvas/element-types'
import { computeSnap } from '@shared/canvas/snap-guides'
import { useCameraStore } from '@/store/camera-store'
import { newElementId, useDocumentStore } from '@/store/document-store'
import { useInteractionOverlayStore } from '@/store/interaction-overlay-store'
import { SNAP_THRESHOLD_PX } from '@/lib/frame-chrome'

export type MoveSession = {
  kind: 'move'
  startWorld: Point
  ids: ElementId[]
  /** Originals so moves are absolute (no drift) and connectors translate their free ends. */
  originals: Record<ElementId, CanvasElement>
  bounds: Rect
  others: Rect[]
  /** Copies are moving; releasing the modifiers keeps them, like the press-time ⌥ / ⇧⌘ drag. */
  duplicating: boolean
}

/** Starts dragging the selection (or `targetId`); optionally duplicates first (⌥ / ⇧⌘ drag). */
export function beginMoveSession(
  targetId: ElementId | null,
  start: { world: Point },
  duplicate: boolean
): MoveSession {
  const doc = useDocumentStore.getState()
  const ids = targetId === null || doc.selectedIds.includes(targetId) ? doc.selectedIds : [targetId]
  const moving = withFrameContents(doc.document, ids)
  doc.beginEdit()
  return trackMove(duplicate ? duplicateInPlace(moving) : moving, start.world, duplicate)
}

/**
 * Switches a running move to a duplicate drag when ⌥ / ⇧⌘ arrives after the press: the originals
 * return to where they started and copies made there continue from the same press origin, inside
 * the same edit, so the whole gesture is still one undo step.
 */
function duplicateMoveSession(move: MoveSession): MoveSession {
  useDocumentStore
    .getState()
    .applyLive((d) => patchElements(d, move.ids, (element) => move.originals[element.id] ?? {}))
  return trackMove(duplicateInPlace(move.ids), move.startWorld, true)
}

/** One pointer sample of a move; ⌥ / ⇧⌘ switch it to duplication whenever they first appear. */
export function dragMoveSession(
  move: MoveSession,
  info: PointerModifiers & { world: Point }
): MoveSession {
  const current = move.duplicating || !wantsDuplicate(info) ? move : duplicateMoveSession(move)
  applyMoveSession(current, info.world, moveModifiers(info))
  return current
}

/** Copies `ids` where they are inside the running edit and returns the copies' IDs. */
function duplicateInPlace(ids: readonly ElementId[]): ElementId[] {
  let copies: ElementId[] = []
  useDocumentStore.getState().applyLive((d) => {
    const result = duplicateElements(d, ids, newElementId, { x: 0, y: 0 })
    copies = result.newIds
    return result.document
  })
  return copies
}

/** Selects `ids` and records their current state so each sample moves them from `startWorld`. */
function trackMove(ids: ElementId[], startWorld: Point, duplicating: boolean): MoveSession {
  useDocumentStore.getState().setSelection(ids)
  const document = useDocumentStore.getState().document
  const originals: Record<ElementId, CanvasElement> = {}
  const rects: Rect[] = []
  for (const id of ids) {
    const element = document.elements[id]
    if (element) {
      originals[id] = element
      rects.push(elementBounds(element))
    }
  }
  const moving = new Set(ids)
  // Why: connectors are thin and follow hosts; they make poor snap targets.
  const others = document.order
    .filter((id) => !moving.has(id))
    .flatMap((id) => {
      const element = document.elements[id]
      return element && element.type !== 'connector' ? [elementBounds(element)] : []
    })
  return {
    kind: 'move',
    startWorld,
    ids,
    originals,
    bounds: unionRects(rects) ?? { x: 0, y: 0, width: 0, height: 0 },
    others,
    duplicating
  }
}

/** Pointer modifier state that a move session reads on every event. */
export type PointerModifiers = { shiftKey: boolean; altKey: boolean; primaryKey: boolean }

export function moveModifiers(info: PointerModifiers): MoveModifiers {
  return { disableSnap: info.primaryKey, constrainAxis: info.shiftKey }
}

/** ⌥-drag (standard) or ⇧⌘-drag duplicates the selection instead of moving it. */
export function wantsDuplicate(info: PointerModifiers): boolean {
  return info.altKey || (info.shiftKey && info.primaryKey)
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
