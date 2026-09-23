import { describe, expect, it } from 'vitest'
import { insertElement } from './document-mutations'
import { alignElements, distributeElements } from './element-alignment'
import {
  createEmptyDocument,
  defaultShapeStyle,
  defaultTextStyle,
  type CanvasDocument,
  type ShapeElement
} from './element-types'

function docWithRects(rects: [string, number, number, number, number][]): CanvasDocument {
  let doc = createEmptyDocument()
  for (const [id, x, y, width, height] of rects) {
    doc = insertElement(doc, {
      id,
      type: 'shape',
      shape: 'rectangle',
      x,
      y,
      width,
      height,
      style: defaultShapeStyle,
      text: '',
      textStyle: defaultTextStyle
    })
  }
  return doc
}

describe('element-alignment', () => {
  const doc = docWithRects([
    ['a', 0, 0, 100, 50],
    ['b', 300, 200, 50, 100],
    ['c', 120, 40, 20, 20]
  ])
  const ids = ['a', 'b', 'c']

  it('aligns to the selection bounds', () => {
    expect(alignElements(doc, ids, 'left').elements.b?.x).toBe(0)
    expect(alignElements(doc, ids, 'right').elements.a?.x).toBe(250)
    expect(alignElements(doc, ids, 'centerX').elements.c?.x).toBe(165)
    expect(alignElements(doc, ids, 'top').elements.b?.y).toBe(0)
    expect(alignElements(doc, ids, 'bottom').elements.a?.y).toBe(250)
    expect(alignElements(doc, ids, 'centerY').elements.c?.y).toBe(140)
    expect(alignElements(doc, ['a'], 'left')).toBe(doc)
  })

  it('lands upright elements exactly on the edge, without floating-point drift', () => {
    const fractional = docWithRects([
      ['p', 0.3, 12.7, 10, 10],
      ['q', 0.1, 3.1, 10, 10]
    ])
    expect(alignElements(fractional, ['p', 'q'], 'left').elements.p?.x).toBe(0.1)
    expect(alignElements(fractional, ['p', 'q'], 'top').elements.p?.y).toBe(3.1)
  })

  it('distributes with equal gaps, keeping the outer elements fixed', () => {
    const out = distributeElements(doc, ids, 'x')
    expect(out.elements.a?.x).toBe(0)
    expect(out.elements.b?.x).toBe(300)
    // span 350, occupied 170, gap 90 → c sits at 100 + 90
    expect(out.elements.c?.x).toBe(190)
    expect(distributeElements(doc, ['a', 'b'], 'x')).toBe(doc)
    const vertical = distributeElements(doc, ids, 'y')
    expect(vertical.elements.c?.y).toBe(50 + (300 - 170) / 2)
  })
})

describe('aligning rotated elements', () => {
  // A 100×20 bar turned upright shows at x 40–60, y 0–100.
  const doc = insertElement(docWithRects([['a', 200, 0, 50, 50]]), {
    ...(docWithRects([['r', 0, 40, 100, 20]]).elements.r as ShapeElement),
    rotation: 90
  })

  it('lines up what shows, not the upright box', () => {
    expect(alignElements(doc, ['a', 'r'], 'left').elements.a?.x).toBeCloseTo(40, 9)
    expect(alignElements(doc, ['a', 'r'], 'left').elements.r?.x).toBe(0)
    const right = alignElements(doc, ['a', 'r'], 'right').elements.r!
    expect(right.x).toBeCloseTo(190, 9)
    expect(alignElements(doc, ['a', 'r'], 'bottom').elements.a?.y).toBeCloseTo(50, 9)
  })

  it('distributes by visible extents', () => {
    const three = insertElement(doc, {
      ...(docWithRects([['z', 400, 0, 20, 20]]).elements.z as ShapeElement)
    })
    // Extents 40–60, 200–250 and 400–420: span 380, occupied 90, so two gaps of 145.
    const out = distributeElements(three, ['a', 'r', 'z'], 'x')
    expect(out.elements.a?.x).toBeCloseTo(205, 9)
    expect(out.elements.r?.x).toBe(0)
  })
})
