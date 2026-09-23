import {
  rectToCssPosition,
  worldRectToScreen,
  worldToScreen
} from '@shared/canvas/camera-transform'
import type { Camera } from '@shared/canvas/element-types'
import { anchorPoint, anchorPorts } from '@shared/canvas/connector-geometry'
import type { SnapGuide } from '@shared/canvas/snap-guides'
import { selectCamera, useCameraStore } from '@/store/camera-store'
import { useInteractionOverlayStore } from '@/store/interaction-overlay-store'

function GuideLine({ guide, camera }: { guide: SnapGuide; camera: Camera }) {
  if (guide.kind === 'line') {
    const a = worldToScreen(
      camera,
      guide.axis === 'x'
        ? { x: guide.position, y: guide.from }
        : { x: guide.from, y: guide.position }
    )
    const b = worldToScreen(
      camera,
      guide.axis === 'x' ? { x: guide.position, y: guide.to } : { x: guide.to, y: guide.position }
    )
    return (
      <div
        data-testid="snap-guide"
        className="absolute bg-snap"
        style={
          guide.axis === 'x'
            ? { left: a.x, top: a.y, width: 1, height: b.y - a.y }
            : { left: a.x, top: a.y, width: b.x - a.x, height: 1 }
        }
      />
    )
  }
  return (
    <>
      {guide.segments.map((segment, i) => {
        const a = worldToScreen(
          camera,
          guide.axis === 'x'
            ? { x: segment.from, y: guide.cross }
            : { x: guide.cross, y: segment.from }
        )
        const b = worldToScreen(
          camera,
          guide.axis === 'x' ? { x: segment.to, y: guide.cross } : { x: guide.cross, y: segment.to }
        )
        return (
          <div
            key={i}
            data-testid="snap-gap"
            className="absolute border-snap"
            style={
              guide.axis === 'x'
                ? {
                    left: a.x,
                    top: a.y - 4,
                    width: b.x - a.x,
                    height: 8,
                    borderLeftWidth: 1,
                    borderRightWidth: 1,
                    borderTopWidth: 0,
                    borderBottomWidth: 0,
                    backgroundImage: 'linear-gradient(var(--snap), var(--snap))',
                    backgroundSize: '100% 1px',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat'
                  }
                : {
                    left: a.x - 4,
                    top: a.y,
                    width: 8,
                    height: b.y - a.y,
                    borderTopWidth: 1,
                    borderBottomWidth: 1,
                    borderLeftWidth: 0,
                    borderRightWidth: 0,
                    backgroundImage: 'linear-gradient(var(--snap), var(--snap))',
                    backgroundSize: '1px 100%',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat'
                  }
            }
          />
        )
      })}
    </>
  )
}

/** Marquee selection box, shape-creation preview and smart guides, drawn in screen space. */
export function DragOverlays() {
  const camera = useCameraStore(selectCamera)
  const dragBox = useInteractionOverlayStore((s) => s.dragBox)
  const preview = useInteractionOverlayStore((s) => s.createPreview)
  const guides = useInteractionOverlayStore((s) => s.snapGuides)
  const anchorPreview = useInteractionOverlayStore((s) => s.anchorPreview)

  return (
    <div className="pointer-events-none absolute inset-0">
      {dragBox && (
        <div
          data-testid="selection-marquee"
          className="absolute border border-selection bg-selection/10"
          style={rectToCssPosition(worldRectToScreen(camera, dragBox))}
        />
      )}
      {anchorPreview &&
        anchorPorts(anchorPreview.outline).map((side) => {
          const p = worldToScreen(
            camera,
            anchorPoint(anchorPreview.rect, side, anchorPreview.outline)
          )
          const active = side === anchorPreview.side
          return (
            <div
              key={side}
              data-testid={active ? 'anchor-active' : 'anchor-dot'}
              className={`absolute rounded-full border-2 border-selection ${active ? 'bg-selection' : 'bg-background'}`}
              style={{
                left: p.x - (active ? 7 : 5),
                top: p.y - (active ? 7 : 5),
                width: active ? 14 : 10,
                height: active ? 14 : 10
              }}
            />
          )
        })}
      {guides.map((guide, i) => (
        <GuideLine key={i} guide={guide} camera={camera} />
      ))}
      {preview && (
        <div
          className={
            preview.tool === 'ellipse'
              ? 'absolute rounded-full border border-dashed border-selection'
              : 'absolute border border-dashed border-selection'
          }
          style={rectToCssPosition(worldRectToScreen(camera, preview.rect))}
        />
      )}
    </div>
  )
}
