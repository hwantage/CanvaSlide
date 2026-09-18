import { describe, expect, it } from 'vitest'
import { createEmptyDocument, type CanvasElement } from './element-types'
import { cascadeRect, objectPastePlacement } from './paste-placement'

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

describe('objectPastePlacement', () => {
  const rects = [
    { x: -100, y: 20, width: 80, height: 40 },
    { x: 40, y: -20, width: 60, height: 100 }
  ]

  it('retains the original 24-unit cascade without a target', () => {
    const first = objectPastePlacement(rects, null, null)
    expect(first.offset).toEqual({ x: 24, y: 24 })
    expect(objectPastePlacement(rects, null, first).offset).toEqual({ x: 48, y: 48 })
  })

  it('centres the union at a distant target with one translation for every element', () => {
    const result = objectPastePlacement(rects, { x: -3000, y: 6000 }, null)
    expect(result.offset).toEqual({ x: -3000, y: 5970 })
    const moved = rects.map((rect) => ({
      ...rect,
      x: rect.x + result.offset.x,
      y: rect.y + result.offset.y
    }))
    expect(moved[1]!.x - moved[0]!.x).toBe(140)
    expect(moved[1]!.y - moved[0]!.y).toBe(-40)
    expect(rects[0]!.x).toBe(-100)
  })

  it('starts at the pointer after offset pastes, cascades there, and resets at a new target', () => {
    const source = objectPastePlacement(rects, null, null)
    const first = objectPastePlacement(rects, { x: 500, y: 600 }, source)
    expect(first.offset).toEqual({ x: 500, y: 570 })
    const second = objectPastePlacement(rects, { x: 500, y: 600 }, first)
    expect(second.offset).toEqual({ x: 524, y: 594 })
    expect(objectPastePlacement(rects, { x: 600, y: 600 }, second).offset).toEqual({
      x: 600,
      y: 570
    })
    expect(objectPastePlacement(rects, null, second).offset).toEqual({ x: 96, y: 96 })
  })

  it('keeps the original paste sequence when returning from pointer placement', () => {
    const first = objectPastePlacement(rects, null, null)
    const second = objectPastePlacement(rects, null, first)
    const atPointer = objectPastePlacement(rects, { x: 500, y: 600 }, second)
    const outside = objectPastePlacement(rects, null, atPointer)
    expect(outside.offset).toEqual({ x: 96, y: 96 })
    expect(objectPastePlacement(rects, null, outside).offset).toEqual({ x: 120, y: 120 })
  })
})
