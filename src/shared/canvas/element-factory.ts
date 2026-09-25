import type {
  CanvasDocument,
  CanvasElement,
  ElementId,
  FrameElement,
  ImageElement,
  Point,
  Rect,
  ShapeElement,
  ShapeKind,
  TextElement
} from './element-types'
import { defaultFrameName, nextFrameOrder } from './presentation-sequence'
import { clampRectSize } from './resize-handles'
import type { StyleMemory } from './style-memory'
import { textLineHeight } from './text-height'

export const DEFAULT_SHAPE_SIZE = { width: 160, height: 100 }
export const DEFAULT_FRAME_SIZE = { width: 960, height: 540 }
export const DEFAULT_TEXT_WIDTH = 240

/** The editor supplies a fresh id and the last style the user applied (see style-memory). */
export type NewElementContext = { id: ElementId; style: StyleMemory }

export function createShapeElement(
  shape: ShapeKind,
  rect: Rect,
  { id, style }: NewElementContext
): ShapeElement {
  return {
    id,
    type: 'shape',
    shape,
    ...rect,
    style: { ...style.shape },
    text: '',
    textStyle: { ...style.shapeText }
  }
}

export function createTextElement(
  origin: Point,
  { id, style }: NewElementContext,
  width = DEFAULT_TEXT_WIDTH
): TextElement {
  const textStyle = { ...style.text }
  return {
    id,
    type: 'text',
    text: '',
    x: origin.x,
    y: origin.y,
    width,
    height: textLineHeight(textStyle.fontSize, textStyle.lineHeight),
    textStyle
  }
}

export function createFrameElement(
  document: CanvasDocument,
  rect: Rect,
  id: ElementId
): FrameElement {
  const order = nextFrameOrder(document)
  return { id, type: 'frame', name: defaultFrameName(order), order, ...rect }
}

export function createImageElement(
  assetId: string,
  natural: { width: number; height: number },
  rect: Rect,
  id: ElementId
): ImageElement {
  return {
    id,
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

export const createTools = ['text', 'rectangle', 'ellipse', 'diamond', 'triangle', 'frame'] as const
export type CreateTool = (typeof createTools)[number]

export function isCreateTool(tool: string): tool is CreateTool {
  return (createTools as readonly string[]).includes(tool)
}

function centeredRect(center: Point, size: { width: number; height: number }): Rect {
  return { x: center.x - size.width / 2, y: center.y - size.height / 2, ...size }
}

/** `draggedRect` is null for a plain click: fall back to a default-sized element at `origin`. */
export function createElementForTool(
  tool: CreateTool,
  document: CanvasDocument,
  draggedRect: Rect | null,
  origin: Point,
  context: NewElementContext
): CanvasElement {
  // Why: a straight vertical/horizontal drag has a 0 extent; the schema rejects non-positive sizes.
  const dragged = draggedRect ? clampRectSize(draggedRect) : null
  switch (tool) {
    case 'text':
      return createTextElement(
        dragged ? { x: dragged.x, y: dragged.y } : origin,
        context,
        dragged?.width
      )
    case 'frame':
      return createFrameElement(
        document,
        dragged ?? centeredRect(origin, DEFAULT_FRAME_SIZE),
        context.id
      )
    case 'rectangle':
    case 'ellipse':
    case 'diamond':
    case 'triangle':
      return createShapeElement(tool, dragged ?? centeredRect(origin, DEFAULT_SHAPE_SIZE), context)
  }
}
