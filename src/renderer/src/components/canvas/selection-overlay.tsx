import type { CSSProperties, PointerEvent } from 'react'
import { RotateCw } from 'lucide-react'
import {
  rectToCssPosition,
  worldRectToScreen,
  worldToScreen
} from '@shared/canvas/camera-transform'
import { elementRect, selectionBounds } from '@shared/canvas/element-bounds'
import {
  canRotateSelection,
  elementBox,
  elementRotation,
  rectCenter,
  rotatedHandleAnchors,
  rotationHandlePoint,
  rotationTransform,
  ROTATION_SNAP_DEGREES,
  type RotatedRect
} from '@shared/canvas/element-rotation'
import type { Camera, CanvasElement, ConnectorElement } from '@shared/canvas/element-types'
import { visibleTextRect } from '@shared/canvas/text-clip'
import { handleCursor, handlePositions, type HandlePosition } from '@shared/canvas/resize-handles'
import { t } from '@/i18n/ui-strings'
import {
  ROTATION_HANDLE_OFFSET_PX,
  ROTATION_HANDLE_PX,
  SELECTION_HANDLE_PX
} from '@/lib/frame-chrome'
import { shiftLabel } from '@/lib/platform-keys'
import { selectCamera, useCameraStore } from '@/store/camera-store'
import { selectDocument, selectSelectedIds, useDocumentStore } from '@/store/document-store'
import { useInteractionOverlayStore } from '@/store/interaction-overlay-store'
import { selectPresentationActive, usePresentationStore } from '@/store/presentation-store'
import { selectEditingTextId, useToolStore } from '@/store/tool-store'

type SelectionOverlayProps = {
  onResizeHandleDown: (handle: HandlePosition, event: PointerEvent<HTMLElement>) => void
  onRotateHandleDown: (event: PointerEvent<HTMLElement>) => void
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

/** Screen box for a world box; the editor camera never rolls, so the turn carries over as is. */
function toScreen(camera: Camera, box: RotatedRect): RotatedRect {
  return { ...worldRectToScreen(camera, box), rotation: box.rotation }
}

function boxStyle(screen: RotatedRect): CSSProperties {
  return { ...rectToCssPosition(screen), transform: rotationTransform(screen.rotation) }
}

/** One member's outline in a multi-selection; clipped text still turns about its whole box. */
function outlineStyle(camera: Camera, element: CanvasElement): CSSProperties {
  const rect = element.type === 'text' ? visibleTextRect(element) : elementRect(element)
  const style = rectToCssPosition(worldRectToScreen(camera, rect))
  const rotation = elementRotation(element)
  if (rotation === 0) {
    return style
  }
  const center = rectCenter(element)
  return {
    ...style,
    transform: rotationTransform(rotation),
    transformOrigin: `${(center.x - rect.x) * camera.zoom}px ${(center.y - rect.y) * camera.zoom}px`
  }
}

/** Screen-space selection chrome so handle sizes never scale with zoom. */
export function SelectionOverlay({
  onResizeHandleDown,
  onRotateHandleDown,
  onConnectorEndDown
}: SelectionOverlayProps) {
  const camera = useCameraStore(selectCamera)
  const document = useDocumentStore(selectDocument)
  const selectedIds = useDocumentStore(selectSelectedIds)
  const editingTextId = useToolStore(selectEditingTextId)
  const presenting = usePresentationStore(selectPresentationActive)
  const selecting = useInteractionOverlayStore((s) => s.dragBox !== null)
  const guide = useInteractionOverlayStore((s) => s.rotationGuide)

  const bounds = selectionBounds(document, selectedIds)
  if (!bounds || presenting || editingTextId) {
    return null
  }
  const only = selectedIds.length === 1 ? document.elements[selectedIds[0] as string] : undefined
  // Why: a lone element's handles sit on its own turned box; a group's on its upright bounds.
  const box = guide?.box ?? (only ? elementBox(only) : bounds)
  const screen = toScreen(camera, box)
  const anchors = rotatedHandleAnchors(screen)
  const half = SELECTION_HANDLE_PX / 2
  const boxed = !selecting && only?.type !== 'connector'
  const rotator = rotationHandlePoint(screen, ROTATION_HANDLE_OFFSET_PX)
  const canRotate = !selecting && canRotateSelection(document, selectedIds)

  return (
    <div className="pointer-events-none absolute inset-0">
      {(selecting || selectedIds.length > 1) &&
        selectedIds.map((id) => {
          const element = document.elements[id]
          if (!element) {
            return null
          }
          return (
            <div
              key={id}
              data-selection-id={id}
              className="absolute border border-selection"
              style={outlineStyle(camera, element)}
            />
          )
        })}
      {boxed && (
        <div
          data-testid="selection-bounds"
          className="absolute border border-selection"
          style={boxStyle(screen)}
        />
      )}
      {!selecting && only?.type === 'connector' && (
        <ConnectorEndHandles connector={only} onConnectorEndDown={onConnectorEndDown} />
      )}
      {canRotate && (
        <svg className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
          <line
            x1={anchors.n.x}
            y1={anchors.n.y}
            x2={rotator.x}
            y2={rotator.y}
            className="stroke-selection"
            strokeWidth={1}
          />
        </svg>
      )}
      {boxed &&
        !guide &&
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
              transform: rotationTransform(screen.rotation),
              cursor: handleCursor(handle, screen.rotation)
            }}
            onPointerDown={(event) => onResizeHandleDown(handle, event)}
          />
        ))}
      {canRotate && (
        <div
          role="presentation"
          data-testid="rotation-handle"
          title={t('selection.rotateHint', {
            shift: shiftLabel(),
            step: `${ROTATION_SNAP_DEGREES}°`
          })}
          className="pointer-events-auto absolute flex cursor-grab items-center justify-center rounded-full border border-selection bg-background text-selection active:cursor-grabbing"
          style={{
            left: rotator.x - ROTATION_HANDLE_PX / 2,
            top: rotator.y - ROTATION_HANDLE_PX / 2,
            width: ROTATION_HANDLE_PX,
            height: ROTATION_HANDLE_PX
          }}
          onPointerDown={onRotateHandleDown}
        >
          <RotateCw size={10} strokeWidth={2.5} />
        </div>
      )}
      {guide && (
        <div
          data-testid="rotation-angle"
          className="absolute whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-background"
          style={{ left: rotator.x + ROTATION_HANDLE_PX, top: rotator.y - ROTATION_HANDLE_PX / 2 }}
        >
          {`${Math.round(guide.degrees)}°`}
        </div>
      )}
    </div>
  )
}
