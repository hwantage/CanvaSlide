import { describe, expect, it } from 'vitest'
import { clampMenuToViewport, placePopoverBelow } from './menu-placement'

describe('clampMenuToViewport', () => {
  const viewport = { width: 1000, height: 600 }
  const size = { width: 220, height: 300 }

  it('keeps the anchor when the menu fits', () => {
    expect(clampMenuToViewport({ x: 100, y: 50 }, size, viewport)).toEqual({ x: 100, y: 50 })
  })

  it('pushes the menu left so its full width stays inside the right edge', () => {
    expect(clampMenuToViewport({ x: 990, y: 50 }, size, viewport)).toEqual({ x: 776, y: 50 })
  })

  it('pushes the menu up so its full height stays inside the bottom edge', () => {
    expect(clampMenuToViewport({ x: 100, y: 590 }, size, viewport)).toEqual({ x: 100, y: 296 })
  })

  it('clamps both axes in a corner and never goes negative', () => {
    expect(clampMenuToViewport({ x: 999, y: 599 }, size, viewport)).toEqual({ x: 776, y: 296 })
    const tiny = { width: 100, height: 100 }
    expect(clampMenuToViewport({ x: 50, y: 50 }, size, tiny)).toEqual({ x: 0, y: 0 })
  })

  it('honours a custom margin', () => {
    expect(clampMenuToViewport({ x: 990, y: 50 }, size, viewport, 10)).toEqual({ x: 770, y: 50 })
  })
})

describe('placePopoverBelow', () => {
  const viewport = { width: 1000, height: 600 }
  const size = { width: 200, height: 100 }

  it('hangs right-aligned under the anchor with the default gap', () => {
    const anchor = { x: 500, y: 100, width: 80, height: 28 }
    expect(placePopoverBelow(anchor, size, viewport)).toEqual({ x: 380, y: 132 })
  })

  it('flips above the anchor when the bottom edge is too close', () => {
    const anchor = { x: 500, y: 520, width: 80, height: 28 }
    expect(placePopoverBelow(anchor, size, viewport)).toEqual({ x: 380, y: 416 })
  })

  it('keeps the margin from the left and right edges', () => {
    expect(placePopoverBelow({ x: 0, y: 0, width: 40, height: 28 }, size, viewport).x).toBe(8)
    expect(placePopoverBelow({ x: 990, y: 0, width: 40, height: 28 }, size, viewport).x).toBe(792)
  })
})
