import {
  defaultShapeStyle,
  defaultTextStyle,
  type CanvasDocument,
  type FrameElement,
  type ImageElement,
  type Point,
  type Rect,
  type ShapeElement,
  type ShapeKind,
  type TextElement
} from '@shared/canvas/element-types'
import { defaultFrameName, nextFrameOrder } from '@shared/canvas/presentation-sequence'
import { newElementId } from '@/store/document-store'

export const DEFAULT_SHAPE_SIZE = { width: 160, height: 100 }
export const DEFAULT_FRAME_SIZE = { width: 960, height: 540 }
export const DEFAULT_TEXT_WIDTH = 240

export function textLineHeight(fontSize: number): number {
  return Math.round(fontSize * 1.4)
}

export function createShapeElement(shape: ShapeKind, rect: Rect): ShapeElement {
  return {
    id: newElementId(),
    type: 'shape',
    shape,
    ...rect,
    style: { ...defaultShapeStyle },
    text: '',
    textStyle: { ...defaultTextStyle, align: 'center' }
  }
}

export function createTextElement(origin: Point, width = DEFAULT_TEXT_WIDTH): TextElement {
  return {
    id: newElementId(),
    type: 'text',
    text: '',
    x: origin.x,
    y: origin.y,
    width,
    height: textLineHeight(defaultTextStyle.fontSize),
    textStyle: { ...defaultTextStyle }
  }
}

export function createFrameElement(document: CanvasDocument, rect: Rect): FrameElement {
  const order = nextFrameOrder(document)
  return { id: newElementId(), type: 'frame', name: defaultFrameName(order), order, ...rect }
}

export function createImageElement(
  assetId: string,
  natural: { width: number; height: number },
  rect: Rect
): ImageElement {
  return {
    id: newElementId(),
    type: 'image',
    assetId,
    naturalWidth: natural.width,
    naturalHeight: natural.height,
    ...rect
  }
}

/** Rect for a freshly pasted image: fits within `maxBox`, centered on it, never upscaled. */
export function placeImageRect(natural: { width: number; height: number }, maxBox: Rect): Rect {
  const scale = Math.min(1, maxBox.width / natural.width, maxBox.height / natural.height)
  const width = natural.width * scale
  const height = natural.height * scale
  return {
    x: maxBox.x + (maxBox.width - width) / 2,
    y: maxBox.y + (maxBox.height - height) / 2,
    width,
    height
  }
}
