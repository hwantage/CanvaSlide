import { memo } from 'react'
import type { CanvasElement } from '@shared/canvas/element-types'
import { ConnectorElement } from './connector-element'
import { FrameElement } from './frame-element'
import { ImageElement } from './image-element'
import { ShapeElement } from './shape-element'
import { TextElement } from './text-element'
import { VideoElement } from './video-element'

type ElementViewProps = {
  element: CanvasElement
  editing: boolean
  selected: boolean
  layoutScale: number
  videoMode?: 'editor' | 'passive' | 'manual' | 'auto'
}

export const ElementView = memo(function ElementView({
  element,
  editing,
  selected,
  layoutScale,
  videoMode = 'editor'
}: ElementViewProps) {
  switch (element.type) {
    case 'shape':
      return <ShapeElement element={element} editing={editing} />
    case 'text':
      return <TextElement element={element} editing={editing} />
    case 'image':
      return <ImageElement element={element} selected={selected} layoutScale={layoutScale} />
    case 'video':
      return <VideoElement element={element} mode={videoMode} />
    case 'frame':
      return <FrameElement element={element} />
    case 'connector':
      return <ConnectorElement element={element} editing={editing} />
  }
})
