import type { CanvasDocument, CanvasElement, Point, Rect } from '@shared/canvas/element-types'
import { clampRectSize } from '@shared/canvas/resize-handles'
import type { ToolId } from '@/store/tool-store'
import {
  DEFAULT_FRAME_SIZE,
  DEFAULT_SHAPE_SIZE,
  createFrameElement,
  createShapeElement,
  createTextElement
} from './element-factory'

export const createTools = ['text', 'rectangle', 'ellipse', 'diamond', 'triangle', 'frame'] as const
export type CreateTool = (typeof createTools)[number]

export function isCreateTool(tool: ToolId): tool is CreateTool {
  return (createTools as readonly string[]).includes(tool)
}

function centeredRect(center: Point, size: { width: number; height: number }): Rect {
  return { x: center.x - size.width / 2, y: center.y - size.height / 2, ...size }
}

/** `dragged` is null for a plain click: fall back to a default-sized element at `origin`. */
export function createElementForTool(
  tool: CreateTool,
  document: CanvasDocument,
  draggedRect: Rect | null,
  origin: Point
): CanvasElement {
  // Why: a straight vertical/horizontal drag has a 0 extent; the schema rejects non-positive sizes.
  const dragged = draggedRect ? clampRectSize(draggedRect) : null
  switch (tool) {
    case 'text':
      return createTextElement(dragged ? { x: dragged.x, y: dragged.y } : origin, dragged?.width)
    case 'frame':
      return createFrameElement(document, dragged ?? centeredRect(origin, DEFAULT_FRAME_SIZE))
    case 'rectangle':
    case 'ellipse':
    case 'diamond':
    case 'triangle':
      return createShapeElement(tool, dragged ?? centeredRect(origin, DEFAULT_SHAPE_SIZE))
  }
}
