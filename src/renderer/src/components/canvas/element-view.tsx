import { memo } from 'react'
import type { CanvasElement } from '@shared/canvas/element-types'
import { ConnectorElement } from './connector-element'
import { FrameElement } from './frame-element'
import { ImageElement } from './image-element'
import { ShapeElement } from './shape-element'
import { TextElement } from './text-element'

type ElementViewProps = {
  element: CanvasElement
  editing: boolean
  selected: boolean
  frameIndex: number
}

export const ElementView = memo(function ElementView({
  element,
  editing,
  selected,
  frameIndex
}: ElementViewProps) {
  switch (element.type) {
    case 'shape':
      return <ShapeElement element={element} editing={editing} />
    case 'text':
      return <TextElement element={element} editing={editing} />
    case 'image':
      return <ImageElement element={element} />
    case 'frame':
      return (
        <FrameElement element={element} index={frameIndex} selected={selected} editing={editing} />
      )
    case 'connector':
      return <ConnectorElement element={element} editing={editing} />
  }
})
