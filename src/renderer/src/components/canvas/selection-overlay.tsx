import type { PointerEvent } from 'react'
import {
  rectToCssPosition,
  worldRectToScreen,
  worldToScreen
} from '@shared/canvas/camera-transform'
import { elementRect, selectionBounds } from '@shared/canvas/element-bounds'
import type { ConnectorElement } from '@shared/canvas/element-types'
import { visibleTextRect } from '@shared/canvas/text-clip'
import {
  handleAnchorPoints,
  handleCursor,
  handlePositions,
  type HandlePosition
} from '@shared/canvas/resize-handles'
import { SELECTION_HANDLE_PX } from '@/lib/frame-chrome'
import { selectCamera, useCameraStore } from '@/store/camera-store'
import { selectDocument, selectSelectedIds, useDocumentStore } from '@/store/document-store'
import { useInteractionOverlayStore } from '@/store/interaction-overlay-store'
import { selectPresentationActive, usePresentationStore } from '@/store/presentation-store'
import { selectEditingTextId, useToolStore } from '@/store/tool-store'

type SelectionOverlayProps = {
  onResizeHandleDown: (handle: HandlePosition, event: PointerEvent<HTMLElement>) => void
  onConnectorEndDown: (id: string, which: 'start' | 'end', event: PointerEvent<HTMLElement>) => void
}

const END_HANDLE_PX = 12

/** A lone connector gets two draggable end handles instead of a resize box. */
function ConnectorEndHandles({
  connector,
  onConnectorEndDown
}: {
  connector: ConnectorElement
  onConnectorEndDown: SelectionOverlayProps['onConnectorEndDown']
}) {
  const camera = useCameraStore(selectCamera)
  return (
    <div className="pointer-events-none absolute inset-0">
      {(['start', 'end'] as const).map((which) => {
        const p = worldToScreen(camera, connector[which])
        const attached = connector[which].elementId !== undefined
        return (
          <div
            key={which}
            role="presentation"
            data-testid={`connector-${which}-handle`}
            className={`pointer-events-auto absolute cursor-move rounded-full border-2 ${
              attached ? 'border-selection bg-selection' : 'border-selection bg-background'
            }`}
            style={{
              left: p.x - END_HANDLE_PX / 2,
              top: p.y - END_HANDLE_PX / 2,
              width: END_HANDLE_PX,
              height: END_HANDLE_PX
            }}
            onPointerDown={(event) => onConnectorEndDown(connector.id, which, event)}
          />
        )
      })}
    </div>
  )
}

/** Screen-space selection chrome so handle sizes never scale with zoom. */
export function SelectionOverlay({
  onResizeHandleDown,
  onConnectorEndDown
}: SelectionOverlayProps) {
  const camera = useCameraStore(selectCamera)
  const document = useDocumentStore(selectDocument)
  const selectedIds = useDocumentStore(selectSelectedIds)
  const editingTextId = useToolStore(selectEditingTextId)
  const presenting = usePresentationStore(selectPresentationActive)
  const selecting = useInteractionOverlayStore((s) => s.dragBox !== null)

  const bounds = selectionBounds(document, selectedIds)
  if (!bounds || presenting || editingTextId) {
    return null
  }
  const only = selectedIds.length === 1 ? document.elements[selectedIds[0] as string] : undefined
  const screen = worldRectToScreen(camera, bounds)
  const anchors = handleAnchorPoints(screen)
  const half = SELECTION_HANDLE_PX / 2

  return (
    <div className="pointer-events-none absolute inset-0">
      {(selecting || selectedIds.length > 1) &&
        selectedIds.map((id) => {
          const element = document.elements[id]
          if (!element) {
            return null
          }
          const rect = element.type === 'text' ? visibleTextRect(element) : elementRect(element)
          return (
            <div
              key={id}
              data-selection-id={id}
              className="absolute border border-selection"
              style={rectToCssPosition(worldRectToScreen(camera, rect))}
            />
          )
        })}
      {!selecting && only?.type !== 'connector' && (
        <div
          data-testid="selection-bounds"
          className="absolute border border-selection"
          style={rectToCssPosition(screen)}
        />
      )}
      {!selecting && only?.type === 'connector' && (
        <ConnectorEndHandles connector={only} onConnectorEndDown={onConnectorEndDown} />
      )}
      {!selecting &&
        only?.type !== 'connector' &&
        handlePositions.map((handle) => (
          <div
            key={handle}
            role="presentation"
            data-testid="selection-handle"
            className="pointer-events-auto absolute rounded-[2px] border border-selection bg-background"
            style={{
              left: anchors[handle].x - half,
              top: anchors[handle].y - half,
              width: SELECTION_HANDLE_PX,
              height: SELECTION_HANDLE_PX,
              cursor: handleCursor(handle)
            }}
            onPointerDown={(event) => onResizeHandleDown(handle, event)}
          />
        ))}
    </div>
  )
}
