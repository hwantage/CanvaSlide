import { worldRectToScreen, rectToCssPosition } from '@shared/canvas/camera-transform'
import { elementRect } from '@shared/canvas/element-bounds'
import { overviewStackRanks } from '@shared/canvas/overview-stacking'
import { orderedFrames } from '@shared/canvas/presentation-sequence'
import { selectCamera, useCameraStore } from '@/store/camera-store'
import { selectDocument, useDocumentStore } from '@/store/document-store'
import { selectPresentationOverview, usePresentationStore } from '@/store/presentation-store'

/** Overview mode: screen-space hit targets over every frame; hover highlights, click jumps. */
export function PresentationFramePicker() {
  const overview = usePresentationStore(selectPresentationOverview)
  const current = usePresentationStore((s) => s.index)
  const goTo = usePresentationStore((s) => s.goTo)
  const camera = useCameraStore(selectCamera)
  const document = useDocumentStore(selectDocument)
  if (!overview) {
    return null
  }
  const frames = orderedFrames(document)
  const ranks = overviewStackRanks(frames)
  return (
    <div data-canvas-ui className="absolute inset-0">
      {frames.map((frame, index) => (
        <button
          key={frame.id}
          type="button"
          data-testid="overview-frame"
          aria-label={`Go to frame ${index + 1}: ${frame.name}`}
          className={`group absolute cursor-pointer rounded-sm border-2 transition-colors hover:border-selection hover:bg-selection/10 hover:ring-2 hover:ring-selection/30 ${
            index === current ? 'border-selection/60' : 'border-frame-stroke/70'
          }`}
          style={{
            ...rectToCssPosition(worldRectToScreen(camera, elementRect(frame))),
            zIndex: ranks[frame.id]
          }}
          onClick={() => goTo(index)}
        >
          <span className="absolute left-0 top-0 -translate-y-full rounded-t bg-frame-label px-1.5 py-0.5 text-[11px] font-medium text-canvas transition-colors group-hover:bg-selection">
            {index + 1} · {frame.name}
          </span>
        </button>
      ))}
    </div>
  )
}
