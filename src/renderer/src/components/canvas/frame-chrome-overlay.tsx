import { memo, useLayoutEffect, useMemo, useRef } from 'react'
import { worldRectToScreen } from '@shared/canvas/camera-transform'
import type { FrameElement, Camera } from '@shared/canvas/element-types'
import { orderedFrames } from '@shared/canvas/presentation-sequence'
import { FRAME_TITLE_FONT_PX, FRAME_TITLE_HEIGHT_PX } from '@/lib/frame-chrome'
import { useCameraStore } from '@/store/camera-store'
import { selectDocument, selectSelectedIds, useDocumentStore } from '@/store/document-store'
import { selectPresentationActive, usePresentationStore } from '@/store/presentation-store'
import { selectEditingTextId, useToolStore } from '@/store/tool-store'
import { FrameNameEditor } from './frame-name-editor'

const FrameChrome = memo(function FrameChrome({
  frame,
  index,
  selected,
  editing,
  borderStyle
}: {
  frame: FrameElement
  index: number
  selected: boolean
  editing: boolean
  borderStyle: 'solid' | 'dashed' | 'none'
}) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const apply = (camera: Camera) => {
      if (!ref.current) {
        return
      }
      const rect = worldRectToScreen(camera, frame)
      ref.current.style.transform = `translate(${rect.x}px, ${rect.y}px)`
      ref.current.style.width = `${rect.width}px`
      ref.current.style.height = `${rect.height}px`
    }
    apply(useCameraStore.getState().camera)
    return useCameraStore.subscribe((state) => apply(state.camera))
  }, [frame])
  return (
    <div ref={ref} data-frame-chrome-id={frame.id} className="absolute left-0 top-0">
      <div
        className="absolute left-0 flex items-center gap-1.5 whitespace-nowrap text-frame-label"
        style={{
          bottom: '100%',
          height: FRAME_TITLE_HEIGHT_PX,
          fontSize: FRAME_TITLE_FONT_PX,
          zIndex: 2
        }}
      >
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded bg-frame-label px-1 font-semibold text-white">
          {index + 1}
        </span>
        {editing ? (
          <FrameNameEditor key={frame.id} frame={frame} />
        ) : (
          <span className="font-medium">{frame.name}</span>
        )}
      </div>
      <div
        data-testid="frame-outline"
        className="absolute inset-0 rounded-sm"
        style={{
          zIndex: 1,
          borderWidth: borderStyle === 'none' && !selected ? 0 : selected ? 2 : 1,
          borderStyle: selected ? 'solid' : borderStyle,
          borderColor: selected ? 'var(--frame-selected)' : 'var(--frame-stroke)'
        }}
      />
    </div>
  )
})

export function FrameChromeOverlay() {
  const document = useDocumentStore(selectDocument)
  const selectedIds = useDocumentStore(selectSelectedIds)
  const editingId = useToolStore(selectEditingTextId)
  const presenting = usePresentationStore(selectPresentationActive)
  const indices = useMemo(
    () => new Map(orderedFrames(document).map((frame, index) => [frame.id, index])),
    [document]
  )
  if (presenting) {
    return null
  }
  return (
    <div className="pointer-events-none absolute inset-0" data-testid="frame-chrome-overlay">
      {document.order.map((id) => {
        const frame = document.elements[id]
        return frame?.type === 'frame' ? (
          <FrameChrome
            key={id}
            frame={frame}
            index={indices.get(id) ?? 0}
            selected={selectedIds.includes(id)}
            editing={editingId === id}
            borderStyle={document.settings.frameBorder}
          />
        ) : null
      })}
    </div>
  )
}
