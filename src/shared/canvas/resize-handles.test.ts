import { describe, expect, it } from 'vitest'
import {
  MIN_ELEMENT_SIZE,
  clampRectSize,
  handleAnchorPoints,
  resizeRect,
  scaleRectWithin
} from './resize-handles'

describe('resize-handles', () => {
  const rect = { x: 100, y: 100, width: 200, height: 100 }

  it('moves only the dragged edge', () => {
    expect(resizeRect(rect, 'e', { x: 50, y: 999 })).toEqual({ ...rect, width: 250 })
    expect(resizeRect(rect, 'w', { x: 50, y: 0 })).toEqual({ ...rect, x: 150, width: 150 })
    expect(resizeRect(rect, 'n', { x: 0, y: -20 })).toEqual({ ...rect, y: 80, height: 120 })
    expect(resizeRect(rect, 'se', { x: 10, y: 10 })).toEqual({ ...rect, width: 210, height: 110 })
  })

  it('never collapses below the minimum size', () => {
    const shrunk = resizeRect(rect, 'e', { x: -1000, y: 0 }, { minSize: 8 })
    expect(shrunk.width).toBe(8)
    expect(shrunk.x).toBe(100)
    const shrunkLeft = resizeRect(rect, 'w', { x: 1000, y: 0 }, { minSize: 8 })
    expect(shrunkLeft.width).toBe(8)
    expect(shrunkLeft.x + shrunkLeft.width).toBe(300)
  })

  it('keeps aspect ratio and anchors the opposite corner', () => {
    const r = resizeRect(rect, 'se', { x: 200, y: 0 }, { keepAspect: true })
    expect(r.width / r.height).toBeCloseTo(2)
    expect(r.x).toBe(100)
    expect(r.y).toBe(100)
    const nw = resizeRect(rect, 'nw', { x: -100, y: 0 }, { keepAspect: true })
    expect(nw.width / nw.height).toBeCloseTo(2)
    expect(nw.x + nw.width).toBe(300)
    expect(nw.y + nw.height).toBe(200)
  })

  it('exposes eight handle anchors', () => {
    const anchors = handleAnchorPoints(rect)
    expect(anchors.se).toEqual({ x: 300, y: 200 })
    expect(anchors.n).toEqual({ x: 200, y: 100 })
  })

  it('scales a member rect proportionally within group bounds', () => {
    const from = { x: 0, y: 0, width: 100, height: 100 }
    const to = { x: 10, y: 10, width: 200, height: 50 }
    expect(scaleRectWithin({ x: 50, y: 50, width: 25, height: 25 }, from, to)).toEqual({
      x: 110,
      y: 35,
      width: 50,
      height: 12.5
    })
  })
})

describe('clampRectSize', () => {
  it('grows a degenerate drag rect to the minimum size and keeps its origin', () => {
    expect(clampRectSize({ x: 10, y: 20, width: 0, height: 120 })).toEqual({
      x: 10,
      y: 20,
      width: MIN_ELEMENT_SIZE,
      height: 120
    })
    expect(clampRectSize({ x: 0, y: 0, width: 3, height: 0 }, 4)).toEqual({
      x: 0,
      y: 0,
      width: 4,
      height: 4
    })
  })

  it('returns the same rect when it is already large enough', () => {
    const rect = { x: 1, y: 2, width: 50, height: 60 }
    expect(clampRectSize(rect)).toBe(rect)
  })
})
