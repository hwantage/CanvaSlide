import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FRAME_SIZE,
  DEFAULT_SHAPE_SIZE,
  DEFAULT_TEXT_WIDTH,
  createElementForTool,
  createFrameElement,
  createImageElement,
  createShapeElement,
  createTextElement,
  createTools,
  isCreateTool,
  placeImageRect,
  type NewElementContext
} from './element-factory'
import { createEmptyDocument } from './element-runtime'
import type { CanvasDocument, FrameElement } from './element-types'
import { MIN_ELEMENT_SIZE } from './resize-handles'
import { defaultStyleMemory } from './style-memory'

const context: NewElementContext = {
  id: 'new',
  style: {
    ...defaultStyleMemory,
    shape: { ...defaultStyleMemory.shape, fill: '#123456' },
    shapeText: { ...defaultStyleMemory.shapeText, fontSize: 30 },
    text: { ...defaultStyleMemory.text, fontSize: 20, lineHeight: 1.5 }
  }
}

function withFrames(...orders: number[]): CanvasDocument {
  const document = createEmptyDocument()
  for (const order of orders) {
    const frame: FrameElement = {
      id: `f${order}`,
      type: 'frame',
      name: `Frame ${order}`,
      order,
      x: 0,
      y: 0,
      width: 10,
      height: 10
    }
    document.elements[frame.id] = frame
    document.order.push(frame.id)
  }
  return document
}

describe('element factories', () => {
  it('take the id and a copy of the remembered styles from the caller', () => {
    const shape = createShapeElement('ellipse', { x: 1, y: 2, width: 3, height: 4 }, context)
    expect(shape).toMatchObject({ id: 'new', shape: 'ellipse', x: 1, y: 2, width: 3, height: 4 })
    expect(shape.style).toEqual(context.style.shape)
    expect(shape.style).not.toBe(context.style.shape)
    expect(shape.textStyle).toEqual(context.style.shapeText)
    expect(shape.textStyle).not.toBe(context.style.shapeText)
  })

  it('size new text to one line of the remembered text style', () => {
    const text = createTextElement({ x: 5, y: 6 }, context)
    expect(text).toMatchObject({ id: 'new', x: 5, y: 6, width: DEFAULT_TEXT_WIDTH, height: 30 })
    expect(text.textStyle).toEqual(context.style.text)
    expect(text.textStyle).not.toBe(context.style.text)
    expect(createTextElement({ x: 0, y: 0 }, context, 80).width).toBe(80)
  })

  it('number a new frame after the last one', () => {
    const rect = { x: 0, y: 0, width: 10, height: 10 }
    expect(createFrameElement(createEmptyDocument(), rect, 'a')).toMatchObject({
      id: 'a',
      order: 1,
      name: 'Frame 1'
    })
    expect(createFrameElement(withFrames(1, 4), rect, 'b')).toMatchObject({
      id: 'b',
      order: 5,
      name: 'Frame 5'
    })
  })

  it('copy the asset and natural size onto a new image', () => {
    const rect = { x: 1, y: 2, width: 3, height: 4 }
    expect(createImageElement('asset', { width: 30, height: 20 }, rect, 'img')).toEqual({
      id: 'img',
      type: 'image',
      assetId: 'asset',
      naturalWidth: 30,
      naturalHeight: 20,
      ...rect
    })
  })
})

describe('placeImageRect', () => {
  it('fits inside the box, centred on it, and never upscales', () => {
    const box = { x: -50, y: 20, width: 300, height: 200 }
    for (let width = 1; width <= 1200; width += 37) {
      for (let height = 1; height <= 1200; height += 41) {
        const rect = placeImageRect({ width, height }, box)
        const scale = rect.width / width
        expect(rect.height / height).toBeCloseTo(scale, 9)
        expect(scale).toBeLessThanOrEqual(1)
        expect(rect.width).toBeLessThanOrEqual(box.width + 1e-9)
        expect(rect.height).toBeLessThanOrEqual(box.height + 1e-9)
        // Largest fit: one side touches the box unless the image is already small enough.
        const touches =
          Math.abs(rect.width - box.width) < 1e-9 || Math.abs(rect.height - box.height) < 1e-9
        expect(touches || scale === 1).toBe(true)
        expect(rect.x + rect.width / 2).toBeCloseTo(box.x + box.width / 2, 9)
        expect(rect.y + rect.height / 2).toBeCloseTo(box.y + box.height / 2, 9)
      }
    }
  })
})

describe('createElementForTool', () => {
  const document = createEmptyDocument()
  const origin = { x: 100, y: 50 }

  it('recognises only the tools that create elements', () => {
    expect(createTools.every(isCreateTool)).toBe(true)
    expect(['select', 'hand', 'connector', ''].some(isCreateTool)).toBe(false)
  })

  it('centres a default-sized element on a plain click', () => {
    expect(createElementForTool('rectangle', document, null, origin, context)).toMatchObject({
      type: 'shape',
      shape: 'rectangle',
      x: origin.x - DEFAULT_SHAPE_SIZE.width / 2,
      y: origin.y - DEFAULT_SHAPE_SIZE.height / 2,
      ...DEFAULT_SHAPE_SIZE
    })
    expect(createElementForTool('frame', document, null, origin, context)).toMatchObject({
      type: 'frame',
      x: origin.x - DEFAULT_FRAME_SIZE.width / 2,
      y: origin.y - DEFAULT_FRAME_SIZE.height / 2,
      ...DEFAULT_FRAME_SIZE
    })
    expect(createElementForTool('text', document, null, origin, context)).toMatchObject({
      type: 'text',
      ...origin,
      width: DEFAULT_TEXT_WIDTH
    })
  })

  it.each(['rectangle', 'ellipse', 'diamond', 'triangle'] as const)(
    'creates a %s from its tool',
    (tool) => {
      expect(createElementForTool(tool, document, null, origin, context)).toMatchObject({
        type: 'shape',
        shape: tool
      })
    }
  )

  it('uses the dragged rect and gives a straight drag a positive size', () => {
    const line = { x: 10, y: 20, width: 0, height: 80 }
    const shape = createElementForTool('diamond', document, line, origin, context)
    expect(shape).toMatchObject({ id: 'new', x: 10, y: 20, width: MIN_ELEMENT_SIZE, height: 80 })
    const text = createElementForTool('text', document, { ...line, width: 300 }, origin, context)
    expect(text).toMatchObject({ id: 'new', x: 10, y: 20, width: 300 })
    const narrow = createElementForTool('text', document, line, origin, context)
    expect(narrow).toMatchObject({ x: 10, y: 20, width: MIN_ELEMENT_SIZE })
  })

  it('numbers a dragged frame after the frames already in the document', () => {
    const dragged = { x: 1, y: 2, width: 0, height: 50 }
    expect(createElementForTool('frame', withFrames(2), dragged, origin, context)).toEqual({
      id: 'new',
      type: 'frame',
      name: 'Frame 3',
      order: 3,
      x: 1,
      y: 2,
      width: MIN_ELEMENT_SIZE,
      height: 50
    })
  })
})
