import type { FrameElement as FrameElementModel } from '@shared/canvas/element-types'

export function FrameElement({ element }: { element: FrameElementModel }) {
  return (
    <div
      className="absolute rounded-sm bg-frame-fill"
      data-element-id={element.id}
      data-element-type="frame"
      style={{ left: element.x, top: element.y, width: element.width, height: element.height }}
    />
  )
}
