import { describe, expect, it } from 'vitest'
import { insertElement } from './document-mutations'
import { alignElements, distributeElements } from './element-alignment'
import {
  createEmptyDocument,
  defaultShapeStyle,
  defaultTextStyle,
  type CanvasDocument
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
