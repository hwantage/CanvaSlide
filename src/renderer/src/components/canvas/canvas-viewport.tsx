import { useEffect, useLayoutEffect, useRef } from 'react'
import { trackCanvasPastePointer } from '@/lib/canvas-paste-pointer'
import { useCanvasInteraction } from '@/hooks/use-canvas-interaction'
import { measureViewport, useViewportSize } from '@/hooks/use-viewport-size'
import { useWheelZoom } from '@/hooks/use-wheel-zoom'
import {
  selectPresentationActive,
  selectSlideShowActive,
  usePresentationStore
} from '@/store/presentation-store'
import { selectEffectiveTool, useToolStore } from '@/store/tool-store'
import { ContextMenu } from './context-menu'
import { DragOverlays } from './drag-overlays'
import { GridBackground } from './grid-background'
import { PresentationFramePicker } from './presentation-frame-picker'
import { PresentationOverlay } from './presentation-overlay'
import { PresentationStage } from './presentation-stage'
import { PreviewControls } from './preview-controls'
import { SpotlightOverlay } from './spotlight-overlay'
import { SelectionOverlay } from './selection-overlay'
import { WorldLayer } from './world-layer'
import { FrameChromeOverlay } from './frame-chrome-overlay'

const cursorByTool = {
  select: 'default',
  hand: 'grab',
  text: 'text',
  rectangle: 'crosshair',
  ellipse: 'crosshair',
  diamond: 'crosshair',
  frame: 'crosshair',
  connector: 'crosshair'
} as const

export function CanvasViewport() {
  const ref = useRef<HTMLDivElement>(null)
  const tool = useToolStore(selectEffectiveTool)
  const presenting = usePresentationStore(selectPresentationActive)
  const slideShow = usePresentationStore(selectSlideShowActive)
  useViewportSize(ref)
  useWheelZoom(ref)
  const handlers = useCanvasInteraction(ref)

  useEffect(() => {
    if (ref.current) {
      return trackCanvasPastePointer(ref.current)
    }
  }, [])

  // Only slide shows hide editor chrome, so only they need a new viewport before the first flight.
  useLayoutEffect(() => {
    if (slideShow && ref.current) {
      measureViewport(ref.current)
      usePresentationStore.getState().flyToCurrent()
    }
  }, [slideShow])

  return (
    <div
      ref={ref}
      data-testid="canvas-viewport"
      className="relative h-full w-full overflow-hidden touch-none"
      style={{ cursor: presenting ? 'default' : cursorByTool[tool] }}
      onPointerDown={handlers.onPointerDown}
      onPointerMove={handlers.onPointerMove}
      onDoubleClick={handlers.onDoubleClick}
      onContextMenu={handlers.onContextMenu}
      onDragOver={handlers.onDragOver}
      onDrop={handlers.onDrop}
    >
      <GridBackground />
      <PresentationStage>
        <WorldLayer />
        <SpotlightOverlay />
      </PresentationStage>
      <FrameChromeOverlay />
      <SelectionOverlay
        onResizeHandleDown={handlers.onResizeHandleDown}
        onConnectorEndDown={handlers.onConnectorEndDown}
      />
      <DragOverlays />
      <PresentationFramePicker />
      <PresentationOverlay />
      <PreviewControls />
      {!presenting && <ContextMenu />}
    </div>
  )
}
