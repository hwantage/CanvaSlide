import {
  anchorPoint,
  facingSide,
  isConnectable,
  nearestAnchorSide
} from '@shared/canvas/connector-geometry'
import { patchElements } from '@shared/canvas/document-mutations'
import { elementRect, rectContainsPoint } from '@shared/canvas/element-bounds'
import {
  defaultConnectorStyle,
  defaultTextStyle,
  type CanvasDocument,
  type ConnectorElement,
  type ConnectorEnd,
  type ElementId,
  type Point
} from '@shared/canvas/element-types'
import { newElementId, useDocumentStore } from '@/store/document-store'
import { useInteractionOverlayStore } from '@/store/interaction-overlay-store'
import { useCameraStore } from '@/store/camera-store'
import { useToolStore } from '@/store/tool-store'

export type ConnectorCreateSession = { kind: 'connector-create'; id: ElementId; startWorld: Point }
export type ConnectorEndSession = { kind: 'connector-end'; id: ElementId; which: 'start' | 'end' }

const MIN_CONNECTOR_LENGTH = 4
/** Dropping within this many screen px of a port pins the connector to that port. */
const PORT_SNAP_PX = 16

/** Topmost shape/text/image under `point`; frames and connectors are not hosts. */
function hostAt(document: CanvasDocument, point: Point, excludeId: ElementId) {
  for (let i = document.order.length - 1; i >= 0; i -= 1) {
    const id = document.order[i]
    const element = id === undefined ? undefined : document.elements[id]
    if (
      !element ||
      element.id === excludeId ||
      element.type === 'frame' ||
      !isConnectable(element)
    ) {
      continue
    }
    const rect = elementRect(element)
    // Why: ports sit on the outline; accept a small halo around the box so they are easy to hit.
    const halo = PORT_SNAP_PX / useCameraStore.getState().camera.zoom
    const padded = {
      x: rect.x - halo,
      y: rect.y - halo,
      width: rect.width + halo * 2,
      height: rect.height + halo * 2
    }
    if (rectContainsPoint(padded, point)) {
      return element
    }
  }
  return null
}

/**
 * Attached to the host under the pointer, else a free point. Near a port the end is pinned to
 * that port; over the body the port is automatic (the side facing the other end).
 */
export function resolveConnectorEndAt(
  document: CanvasDocument,
  point: Point,
  excludeId: ElementId,
  otherEnd?: Point
): ConnectorEnd {
  const host = hostAt(document, point, excludeId)
  const overlay = useInteractionOverlayStore.getState()
  if (!host) {
    overlay.setAnchorPreview(null)
    return { x: point.x, y: point.y }
  }
  const rect = elementRect(host)
  const nearest = nearestAnchorSide(rect, point)
  const port = anchorPoint(rect, nearest)
  const snapWorld = PORT_SNAP_PX / useCameraStore.getState().camera.zoom
  const pinned = Math.hypot(port.x - point.x, port.y - point.y) <= snapWorld
  const side = pinned || !otherEnd ? nearest : facingSide(rect, otherEnd)
  overlay.setAnchorPreview({ rect, side })
  return pinned
    ? { x: point.x, y: point.y, elementId: host.id, side, pinned: true }
    : { x: point.x, y: point.y, elementId: host.id, side }
}

/** Hover guide for the connector tool: show a host's ports before the drag even starts. */
export function previewConnectorHostAt(document: CanvasDocument, point: Point): void {
  const overlay = useInteractionOverlayStore.getState()
  const host = hostAt(document, point, '')
  if (!host) {
    if (overlay.anchorPreview) {
      overlay.setAnchorPreview(null)
    }
    return
  }
  const rect = elementRect(host)
  const side = nearestAnchorSide(rect, point)
  const current = overlay.anchorPreview
  if (!current || current.side !== side || current.rect.x !== rect.x || current.rect.y !== rect.y) {
    overlay.setAnchorPreview({ rect, side })
  }
}

export function beginConnectorCreate(world: Point): ConnectorCreateSession {
  const doc = useDocumentStore.getState()
  const preset = useToolStore.getState().connectorPreset
  const id = newElementId()
  const start = resolveConnectorEndAt(doc.document, world, id)
  const connector: ConnectorElement = {
    id,
    type: 'connector',
    x: world.x,
    y: world.y,
    width: 1,
    height: 1,
    start,
    end: { x: world.x, y: world.y },
    route: preset.route,
    startHead: preset.startHead,
    endHead: preset.endHead,
    style: { ...defaultConnectorStyle },
    label: '',
    textStyle: { ...defaultTextStyle, fontSize: 14, align: 'center' }
  }
  doc.beginEdit()
  doc.applyLive((d) => ({
    ...d,
    elements: { ...d.elements, [id]: connector },
    order: [...d.order, id]
  }))
  doc.setSelection([id])
  return { kind: 'connector-create', id, startWorld: world }
}

export function updateConnectorEnd(id: ElementId, which: 'start' | 'end', world: Point): void {
  const doc = useDocumentStore.getState()
  const current = doc.document.elements[id]
  const other =
    current?.type === 'connector' ? current[which === 'start' ? 'end' : 'start'] : undefined
  const end = resolveConnectorEndAt(doc.document, world, id, other)
  doc.applyLive((d) => patchElements(d, [id], { [which]: end }))
}

export function finishConnectorCreate(session: ConnectorCreateSession, world: Point): void {
  const doc = useDocumentStore.getState()
  useInteractionOverlayStore.getState().setAnchorPreview(null)
  const length = Math.hypot(world.x - session.startWorld.x, world.y - session.startWorld.y)
  if (length < MIN_CONNECTOR_LENGTH) {
    doc.cancelEdit()
    doc.clearSelection()
  } else {
    doc.endEdit()
  }
  useToolStore.getState().setTool('select')
}

export function beginConnectorEndDrag(id: ElementId, which: 'start' | 'end'): ConnectorEndSession {
  useDocumentStore.getState().beginEdit()
  return { kind: 'connector-end', id, which }
}

export function finishConnectorEndDrag(): void {
  useInteractionOverlayStore.getState().setAnchorPreview(null)
  useDocumentStore.getState().endEdit()
}
