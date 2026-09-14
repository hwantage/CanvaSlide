import { expandToGroups } from '@shared/canvas/element-groups'
import {
  frameContainingPoint,
  hitTestTopmost,
  rectContainsPoint,
  selectionBounds
} from '@shared/canvas/element-bounds'
import type { ElementId, Point } from '@shared/canvas/element-types'
import { useCameraStore } from '@/store/camera-store'
import { useDocumentStore } from '@/store/document-store'
import { useToolStore } from '@/store/tool-store'
import type { PointerInfo } from './canvas-interaction-session'
import { frameHitChromeAt } from './frame-chrome'

/** `targetId` null = pressed on empty space inside the selection bounds (drag moves the group). */
export type PressSession = {
  kind: 'press'
  start: PointerInfo
  targetId: ElementId | null
  additive: boolean
  /** What a click (no drag) selects or toggles: the target's whole group, or just the target. */
  targets: ElementId[]
}
export type BoxSession = {
  kind: 'box'
  startWorld: Point
  additive: boolean
  baseSelection: ElementId[]
}

/** ⇧ or ⌘/Ctrl held: the click toggles membership instead of replacing the selection. */
export function isAdditiveClick(info: PointerInfo): boolean {
  return info.shiftKey || info.primaryKey
}

/** ⌘/Ctrl reaches into a group for one element (Figma's deep select); otherwise the whole group. */
function clickTargets(info: PointerInfo, targetId: ElementId): ElementId[] {
  const { document } = useDocumentStore.getState()
  return info.primaryKey ? [targetId] : expandToGroups(document, [targetId])
}

function pressOn(info: PointerInfo, targetId: ElementId): PressSession {
  const { selectedIds, setSelection } = useDocumentStore.getState()
  const additive = isAdditiveClick(info)
  const targets = clickTargets(info, targetId)
  if (!additive && !targets.every((id) => selectedIds.includes(id))) {
    setSelection(targets)
  }
  return { kind: 'press', start: info, targetId, additive, targets }
}

/** Shift/⌘-click release: the targets join the selection, or leave it if all were already in. */
export function toggleTargets(targets: readonly ElementId[]): void {
  const { selectedIds, setSelection } = useDocumentStore.getState()
  const allIn = targets.every((id) => selectedIds.includes(id))
  setSelection(
    allIn
      ? selectedIds.filter((id) => !targets.includes(id))
      : [...selectedIds, ...targets.filter((id) => !selectedIds.includes(id))]
  )
}

/**
 * Pointer down with the select tool. Returns the session to run, or null when the press landed on
 * the element currently being edited (the editor keeps the pointer).
 */
export function beginSelectSession(info: PointerInfo): PressSession | BoxSession | null {
  const tools = useToolStore.getState()
  const { document, selectedIds, clearSelection } = useDocumentStore.getState()
  const hit = hitTestTopmost(
    document,
    info.world,
    frameHitChromeAt(useCameraStore.getState().camera.zoom)
  )
  if (hit && tools.editingTextId === hit.id) {
    return null
  }
  tools.setEditingTextId(null)
  if (hit) {
    return pressOn(info, hit.id)
  }
  const additive = isAdditiveClick(info)
  // Why: frames only hit on their chrome, but a modifier-click on a frame's empty interior
  // clearly means "add this frame", so it toggles the frame instead of starting a marquee.
  const frame = additive ? frameContainingPoint(document, info.world) : null
  if (frame) {
    return pressOn(info, frame.id)
  }
  // Why: gaps between multi-selected objects must still grab the group, like Miro/Figma.
  const bounds = selectionBounds(document, selectedIds)
  if (bounds && !info.shiftKey && rectContainsPoint(bounds, info.world)) {
    return { kind: 'press', start: info, targetId: null, additive: false, targets: [] }
  }
  const baseSelection = additive ? selectedIds : []
  if (!additive) {
    clearSelection()
  }
  return { kind: 'box', startWorld: info.world, additive, baseSelection }
}
