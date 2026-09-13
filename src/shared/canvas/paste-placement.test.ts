import { describe, expect, it } from 'vitest'
import { createEmptyDocument, type CanvasElement } from './element-types'
import { cascadeRect } from './paste-placement'

const image = (id: string, x: number, y: number): CanvasElement => ({
  id,
  type: 'image',
  assetId: 'a',
  naturalWidth: 10,
  naturalHeight: 10,
  x,
  y,
  width: 10,
  height: 10
})

function documentWith(...elements: CanvasElement[]) {
  const doc = createEmptyDocument()
  for (const element of elements) {
    doc.elements[element.id] = element
    doc.order.push(element.id)
  }
  return doc
}

describe('cascadeRect', () => {
  const rect = { x: 100, y: 50, width: 30, height: 20 }

  it('keeps the rect when nothing sits at its origin', () => {
    expect(cascadeRect(rect, documentWith(image('a', 0, 0)))).toEqual(rect)
  })

  it('steps past every element already at the same origin', () => {
    const doc = documentWith(image('a', 100, 50), image('b', 124, 74))
    expect(cascadeRect(rect, doc)).toEqual({ x: 148, y: 98, width: 30, height: 20 })
  })

  it('only counts exact origin matches, not overlaps', () => {
    expect(cascadeRect(rect, documentWith(image('a', 101, 50)))).toEqual(rect)
  })
})
