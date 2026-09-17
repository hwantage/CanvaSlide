import { describe, expect, it } from 'vitest'
import { createEmptyDocument, type CanvasElement } from './element-types'
import {
  FRAME_FROM_SELECTION_PADDING,
  frameRectAround,
  selectionIsOnlyFrames
} from './frame-from-selection'

const frame = (id: string): CanvasElement => ({
  id,
  type: 'frame',
  name: id,
  order: 1,
  x: 0,
  y: 0,
  width: 400,
  height: 300
})

const shape = (id: string): CanvasElement => ({
  id,
  type: 'shape',
  shape: 'rectangle',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  style: { fill: '#fff', stroke: '#000', strokeWidth: 1, cornerRadius: 0 },
  text: '',
  textStyle: { color: '#000', fontSize: 12, align: 'left', bold: false }
})

function documentWith(...elements: CanvasElement[]) {
  const document = createEmptyDocument()
  for (const element of elements) {
    document.elements[element.id] = element
    document.order.push(element.id)
  }
  return document
}

describe('frame-from-selection', () => {
  it('pads the bounds equally on every side', () => {
    expect(frameRectAround({ x: 100, y: 50, width: 200, height: 80 }, 10)).toEqual({
      x: 90,
      y: 40,
      width: 220,
      height: 100
    })
  })

  it('uses the default padding', () => {
    const rect = frameRectAround({ x: 0, y: 0, width: 10, height: 10 })
    expect(rect.x).toBe(-FRAME_FROM_SELECTION_PADDING)
    expect(rect.width).toBe(10 + FRAME_FROM_SELECTION_PADDING * 2)
  })
})

describe('selectionIsOnlyFrames', () => {
  const document = documentWith(frame('f1'), frame('f2'), shape('a'))

  it('is true only when every selected element is a frame', () => {
    expect(selectionIsOnlyFrames(document, ['f1'])).toBe(true)
    expect(selectionIsOnlyFrames(document, ['f1', 'f2'])).toBe(true)
    expect(selectionIsOnlyFrames(document, ['f1', 'a'])).toBe(false)
    expect(selectionIsOnlyFrames(document, ['a'])).toBe(false)
  })

  it('is false for nothing selected, or for ids the document has lost', () => {
    expect(selectionIsOnlyFrames(document, [])).toBe(false)
    expect(selectionIsOnlyFrames(document, ['missing'])).toBe(false)
  })
})
