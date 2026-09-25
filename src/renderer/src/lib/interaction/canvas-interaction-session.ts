import {
  elementsInBox,
  frameContainingPoint,
  hitTestTopmost,
  rectFromPoints,
  selectionContainsPoint
} from '@shared/canvas/element-bounds'
import { expandToGroups } from '@shared/canvas/element-groups'
import { constrainToSquare } from '@shared/canvas/drag-constraints'
import type { ElementId, Point } from '@shared/canvas/element-types'
import type { HandlePosition } from '@shared/canvas/resize-handles'
import { useCameraStore } from '@/store/camera-store'
import { useDocumentStore } from '@/store/document-store'
import { useInteractionOverlayStore } from '@/store/interaction-overlay-store'
import { usePresentationStore } from '@/store/presentation-store'
import { selectEffectiveTool, useToolStore, type ToolId } from '@/store/tool-store'
import {
  beginConnectorCreate,
  beginConnectorEndDrag,
  finishConnectorCreate,
  finishConnectorEndDrag,
  previewConnectorHostAt,
  updateConnectorEnd,
  type ConnectorCreateSession,
  type ConnectorEndSession
} from './canvas-connector-session'
import { openContextMenu } from './canvas-context-menu'
import {
  applyMoveSession,
  beginMoveSession,
  moveModifiers,
  wantsDuplicate,
  type MoveSession
} from './canvas-move-session'
import { applyResizeSession, beginResizeSession, type ResizeSession } from './canvas-resize-session'
import { applyRotateSession, beginRotateSession, type RotateSession } from './canvas-rotate-session'
import { createElementForTool, isCreateTool, type CreateTool } from './create-element-for-tool'
import { DRAG_THRESHOLD_PX, frameHitChromeAt } from '@/lib/frame-chrome'

export type PointerInfo = {
  screen: Point
  world: Point
  shiftKey: boolean
  altKey: boolean
  /** ⌘ on macOS, Ctrl elsewhere. */
  primaryKey: boolean
  button: number
}

type Session =
  | { kind: 'pan'; lastScreen: Point }
  | PressSession
  | MoveSession
  | BoxSession
  | { kind: 'create'; tool: CreateTool; startWorld: Point }
  | ResizeSession
  | RotateSession
  | ConnectorCreateSession
  | ConnectorEndSession

export type CanvasInteraction = {
  pointerDown: (info: PointerInfo) => void
  pointerMove: (info: PointerInfo) => void
  pointerUp: (info: PointerInfo) => void
  doubleClick: (info: PointerInfo) => void
  /** Right-click: selects what is under the cursor (keeping a multi-selection) and opens the menu. */
  contextMenu: (info: PointerInfo) => void
  startResize: (handle: HandlePosition, info: PointerInfo) => void
  startRotate: (info: PointerInfo) => void
  startConnectorEnd: (id: ElementId, which: 'start' | 'end') => void
  cancel: () => void
  isActive: () => boolean
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function createCanvasInteraction(): CanvasInteraction {
  let session: Session | null = null
  const docStore = useDocumentStore
  const overlay = useInteractionOverlayStore

  const frameChrome = () => frameHitChromeAt(useCameraStore.getState().camera.zoom)

  /** Shift squares every box-like tool; text only takes a width, so it stays free. */
  const createRect = (tool: CreateTool, startWorld: Point, info: PointerInfo) =>
    rectFromPoints(
      startWorld,
      info.shiftKey && tool !== 'text' ? constrainToSquare(startWorld, info.world) : info.world
    )

  const finishCreate = (tool: CreateTool, startWorld: Point, info: PointerInfo) => {
    const dragged = createRect(tool, startWorld, info)
    const tiny = dragged.width < 4 && dragged.height < 4
    const { document, insertElement } = docStore.getState()
    const element = createElementForTool(tool, document, tiny ? null : dragged, startWorld)
    insertElement(element, true)
    const tools = useToolStore.getState()
    tools.setTool('select')
    if (element.type === 'text') {
      tools.setEditingTextId(element.id)
    }
  }

  const clearOverlays = () => {
    overlay.getState().setDragBox(null)
    overlay.getState().setCreatePreview(null)
    overlay.getState().setSnapGuides([])
    overlay.getState().setRotationGuide(null)
  }

  const finish = (info: PointerInfo) => {
    const current = session
    session = null
    clearOverlays()
    if (!current) {
      return
    }
    const doc = docStore.getState()
    switch (current.kind) {
      case 'press':
        if (current.targetId === null) {
          doc.clearSelection()
        } else if (current.additive) {
          toggleTargets(current.targets)
        } else {
          doc.setSelection(current.targets)
        }
        break
      case 'move':
      case 'resize':
      case 'rotate':
        doc.endEdit()
        break
      case 'create':
        finishCreate(current.tool, current.startWorld, info)
        break
      case 'connector-create':
        finishConnectorCreate(current, info.world)
        break
      case 'connector-end':
        finishConnectorEndDrag()
        break
      case 'pan':
      case 'box':
        break
    }
  }

  const cancel = () => {
    if (
      session?.kind === 'move' ||
      session?.kind === 'resize' ||
      session?.kind === 'rotate' ||
      session?.kind === 'connector-end'
    ) {
      docStore.getState().endEdit()
    } else if (session?.kind === 'connector-create') {
      docStore.getState().cancelEdit()
    } else if (session?.kind === 'box') {
      const doc = docStore.getState()
      doc.setSelection(session.baseSelection.filter((id) => doc.document.elements[id]))
    }
    overlay.getState().setAnchorPreview(null)
    session = null
    clearOverlays()
  }

  return {
    isActive: () => session !== null,
    cancel,

    pointerDown: (info) => {
      if (usePresentationStore.getState().active || session) {
        return
      }
      const tool: ToolId = selectEffectiveTool(useToolStore.getState())
      if (info.button === 1 || tool === 'hand') {
        session = { kind: 'pan', lastScreen: info.screen }
        return
      }
      if (info.button !== 0) {
        return
      }
      if (tool === 'connector') {
        useToolStore.getState().setEditingTextId(null)
        session = beginConnectorCreate(info.world)
        return
      }
      if (isCreateTool(tool)) {
        useToolStore.getState().setEditingTextId(null)
        docStore.getState().clearSelection()
        session = { kind: 'create', tool, startWorld: info.world }
        return
      }
      session = beginSelectSession(info)
    },

    pointerMove: (info) => {
      if (!session) {
        // Why: with the connector tool, hovering a shape reveals its ports as a guide.
        const tool = selectEffectiveTool(useToolStore.getState())
        if (tool === 'connector' && !usePresentationStore.getState().active) {
          previewConnectorHostAt(docStore.getState().document, info.world)
        } else if (overlay.getState().anchorPreview) {
          overlay.getState().setAnchorPreview(null)
        }
        return
      }
      const doc = docStore.getState()
      switch (session.kind) {
        case 'pan': {
          const { lastScreen } = session
          useCameraStore
            .getState()
            .panBy(info.screen.x - lastScreen.x, info.screen.y - lastScreen.y)
          session.lastScreen = info.screen
          break
        }
        case 'press':
          if (distance(info.screen, session.start.screen) >= DRAG_THRESHOLD_PX) {
            session = beginMoveSession(
              session.targetId,
              session.start,
              wantsDuplicate(session.start)
            )
            // Why: the event that crosses the threshold is part of the drag; without applying it
            // here a short drag (threshold-sized) would end before ever moving anything.
            applyMoveSession(session, info.world, moveModifiers(info))
          }
          break
        case 'move':
          applyMoveSession(session, info.world, moveModifiers(info))
          break
        case 'box': {
          const box = rectFromPoints(session.startWorld, info.world)
          overlay.getState().setDragBox(box)
          // Why: touching any member of a group with the marquee selects the whole group.
          const inBox = expandToGroups(doc.document, elementsInBox(doc.document, box))
          doc.setSelection(
            session.additive ? [...new Set([...session.baseSelection, ...inBox])] : inBox
          )
          break
        }
        case 'create':
          overlay.getState().setCreatePreview({
            tool: session.tool,
            rect: createRect(session.tool, session.startWorld, info)
          })
          break
        case 'resize':
          applyResizeSession(session, info.world)
          break
        case 'rotate':
          applyRotateSession(session, info.world, info.shiftKey)
          break
        case 'connector-create':
          updateConnectorEnd(session.id, 'end', info.world)
          break
        case 'connector-end':
          updateConnectorEnd(session.id, session.which, info.world)
          break
      }
    },

    pointerUp: finish,

    doubleClick: (info) => {
      if (usePresentationStore.getState().active) {
        return
      }
      const hit = hitTestTopmost(docStore.getState().document, info.world, frameChrome())
      // Why: frames only hit on their chrome, so a double-click there means "rename", like Figma.
      if (hit && hit.type !== 'image') {
        docStore.getState().setSelection([hit.id])
        useToolStore.getState().setEditingTextId(hit.id)
      }
    },

    contextMenu: (info) => {
      if (usePresentationStore.getState().active) {
        return
      }
      // Why: Ctrl+click on macOS also fires `contextmenu` while the left button is down; a gesture
      // in progress (Ctrl-drag, ⌃-duplicate in tests) must keep going rather than open the menu.
      if (session) {
        return
      }
      openContextMenu(info.screen, info.world)
    },

    startResize: (handle, info) => {
      if (session) {
        return
      }
      session = beginResizeSession(handle, info.world, info.shiftKey)
    },

    startRotate: (info) => {
      if (session) {
        return
      }
      session = beginRotateSession(info.world)
    },

    startConnectorEnd: (id, which) => {
      if (session) {
        return
      }
      session = beginConnectorEndDrag(id, which)
    }
  }
}

/** `targetId` null = pressed on empty space inside the selection bounds (drag moves the group). */
type PressSession = {
  kind: 'press'
  start: PointerInfo
  targetId: ElementId | null
  additive: boolean
  /** What a click (no drag) selects or toggles: the target's whole group, or just the target. */
  targets: ElementId[]
}
type BoxSession = {
  kind: 'box'
  startWorld: Point
  additive: boolean
  baseSelection: ElementId[]
}

/** ⇧ or ⌘/Ctrl held: the click toggles membership instead of replacing the selection. */
function isAdditiveClick(info: PointerInfo): boolean {
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
function toggleTargets(targets: readonly ElementId[]): void {
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
function beginSelectSession(info: PointerInfo): PressSession | BoxSession | null {
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
  if (!info.shiftKey && selectionContainsPoint(document, selectedIds, info.world)) {
    return { kind: 'press', start: info, targetId: null, additive: false, targets: [] }
  }
  const baseSelection = selectedIds
  if (!additive) {
    clearSelection()
  }
  return { kind: 'box', startWorld: info.world, additive, baseSelection }
}
