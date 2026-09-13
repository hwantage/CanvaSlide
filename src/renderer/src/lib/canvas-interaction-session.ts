import {
  elementsInBox,
  hitTestTopmost,
  rectContainsPoint,
  rectFromPoints,
  selectionBounds
} from '@shared/canvas/element-bounds'
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
import { applyMoveSession, beginMoveSession, type MoveSession } from './canvas-move-session'
import { applyResizeSession, beginResizeSession, type ResizeSession } from './canvas-resize-session'
import { createElementForTool, isCreateTool, type CreateTool } from './create-element-for-tool'
import {
  DRAG_THRESHOLD_PX,
  FRAME_BORDER_HIT_PX,
  FRAME_TITLE_HEIGHT_PX,
  LINE_HIT_PX
} from './frame-chrome'

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
  /** `targetId` null = pressed on empty space inside the selection bounds (drag moves the group). */
  | { kind: 'press'; start: PointerInfo; targetId: ElementId | null; additive: boolean }
  | MoveSession
  | { kind: 'box'; startWorld: Point; additive: boolean; baseSelection: ElementId[] }
  | { kind: 'create'; tool: CreateTool; startWorld: Point }
  | ResizeSession
  | ConnectorCreateSession
  | ConnectorEndSession

export type CanvasInteraction = {
  pointerDown: (info: PointerInfo) => void
  pointerMove: (info: PointerInfo) => void
  pointerUp: (info: PointerInfo) => void
  doubleClick: (info: PointerInfo) => void
  startResize: (handle: HandlePosition, info: PointerInfo) => void
  startConnectorEnd: (id: ElementId, which: 'start' | 'end') => void
  cancel: () => void
  isActive: () => boolean
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** ⌥-drag (standard) or ⇧⌘-drag duplicates the selection instead of moving it. */
function wantsDuplicate(info: PointerInfo): boolean {
  return info.altKey || (info.shiftKey && info.primaryKey)
}

export function createCanvasInteraction(): CanvasInteraction {
  let session: Session | null = null
  const docStore = useDocumentStore
  const overlay = useInteractionOverlayStore

  const frameChrome = () => {
    const { zoom } = useCameraStore.getState().camera
    return {
      titleHeight: FRAME_TITLE_HEIGHT_PX / zoom,
      borderWidth: FRAME_BORDER_HIT_PX / zoom,
      lineWidth: LINE_HIT_PX / zoom
    }
  }

  const pressOn = (info: PointerInfo, targetId: ElementId) => {
    const { selectedIds, setSelection } = docStore.getState()
    const additive = info.shiftKey && !info.primaryKey
    if (!additive && !selectedIds.includes(targetId)) {
      setSelection([targetId])
    }
    session = { kind: 'press', start: info, targetId, additive }
  }

  const beginSelectTool = (info: PointerInfo) => {
    const tools = useToolStore.getState()
    const hit = hitTestTopmost(docStore.getState().document, info.world, frameChrome())
    if (hit && tools.editingTextId === hit.id) {
      return
    }
    tools.setEditingTextId(null)
    if (hit) {
      pressOn(info, hit.id)
      return
    }
    const { selectedIds, clearSelection, document } = docStore.getState()
    // Why: gaps between multi-selected objects must still grab the group, like Miro/Figma.
    const bounds = selectionBounds(document, selectedIds)
    if (bounds && !info.shiftKey && rectContainsPoint(bounds, info.world)) {
      session = { kind: 'press', start: info, targetId: null, additive: false }
      return
    }
    const baseSelection = info.shiftKey ? selectedIds : []
    if (!info.shiftKey) {
      clearSelection()
    }
    session = { kind: 'box', startWorld: info.world, additive: info.shiftKey, baseSelection }
  }

  const finishCreate = (tool: CreateTool, startWorld: Point, endWorld: Point) => {
    const dragged = rectFromPoints(startWorld, endWorld)
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
          doc.toggleSelected(current.targetId)
        } else {
          doc.setSelection([current.targetId])
        }
        break
      case 'move':
      case 'resize':
        doc.endEdit()
        break
      case 'create':
        finishCreate(current.tool, current.startWorld, info.world)
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

  return {
    isActive: () => session !== null,
    cancel: () => {
      if (
        session?.kind === 'move' ||
        session?.kind === 'resize' ||
        session?.kind === 'connector-end'
      ) {
        docStore.getState().endEdit()
      } else if (session?.kind === 'connector-create') {
        docStore.getState().cancelEdit()
      }
      overlay.getState().setAnchorPreview(null)
      session = null
      clearOverlays()
    },

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
      beginSelectTool(info)
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
          }
          break
        case 'move':
          applyMoveSession(session, info.world, info.primaryKey)
          break
        case 'box': {
          const box = rectFromPoints(session.startWorld, info.world)
          overlay.getState().setDragBox(box)
          const inBox = elementsInBox(doc.document, box)
          doc.setSelection(
            session.additive ? [...new Set([...session.baseSelection, ...inBox])] : inBox
          )
          break
        }
        case 'create':
          overlay.getState().setCreatePreview({
            tool: session.tool,
            rect: rectFromPoints(session.startWorld, info.world)
          })
          break
        case 'resize':
          applyResizeSession(session, info.world)
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

    startResize: (handle, info) => {
      if (session) {
        return
      }
      session = beginResizeSession(handle, info.world, info.shiftKey)
    },

    startConnectorEnd: (id, which) => {
      if (session) {
        return
      }
      session = beginConnectorEndDrag(id, which)
    }
  }
}
