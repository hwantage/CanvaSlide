import { describe, expect, it } from 'vitest'
import type { FrameElement } from './element-types'
import { frameArea, overviewStackRanks, overviewZIndex } from './overview-stacking'

function frame(id: string, order: number, width: number, height: number): FrameElement {
  return { id, type: 'frame', name: id, order, x: 0, y: 0, width, height }
}

describe('overview-stacking', () => {
  it('measures the area a frame covers', () => {
    expect(frameArea(frame('a', 1, 48000, 13500))).toBe(648_000_000)
    expect(frameArea(frame('b', 2, -10, 20))).toBe(0)
  })

  it('puts the largest frame at the bottom and the smallest on top', () => {
    const ranks = overviewStackRanks([
      frame('small', 1, 100, 100),
      frame('huge', 2, 1000, 1000),
      frame('medium', 3, 500, 500)
    ])
    expect(ranks).toEqual({ huge: 0, medium: 1, small: 2 })
  })

  it('keeps a wrapping frame below the frames nested inside it', () => {
    // the-swing.canvaslide: the last frame in the sequence spans the whole canvas.
    const frames = [
      frame('frame-1', 1, 48000, 13500),
      frame('frame-2', 2, 4600, 2587.5),
      frame('frame-8', 3, 17000, 9560),
      frame('frame-12', 4, 48000, 13500)
    ]
    const ranks = overviewStackRanks(frames)
    expect(ranks['frame-2']).toBeGreaterThan(ranks['frame-8'] as number)
    expect(ranks['frame-8']).toBeGreaterThan(ranks['frame-12'] as number)
    // Identical areas keep sequence order, so the later frame stays on top.
    expect(ranks['frame-12']).toBeGreaterThan(ranks['frame-1'] as number)
  })

  it('ranks every frame exactly once', () => {
    const frames = [frame('a', 1, 10, 10), frame('b', 2, 10, 10), frame('c', 3, 20, 5)]
    expect(Object.values(overviewStackRanks(frames)).sort()).toEqual([0, 1, 2])
    expect(overviewStackRanks([])).toEqual({})
  })

  it('maps ranks onto negative z-indices so frames stay behind slide content', () => {
    expect(overviewZIndex(0, 3)).toBe(-3)
    expect(overviewZIndex(2, 3)).toBe(-1)
  })
})
