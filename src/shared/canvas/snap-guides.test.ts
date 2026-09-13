import { describe, expect, it } from 'vitest'
import { computeSnap } from './snap-guides'

const r = (x: number, y: number, width = 100, height = 100) => ({ x, y, width, height })

describe('snap-guides', () => {
  it('snaps edges and centers within the threshold, closest wins', () => {
    const others = [r(300, 300)]
    expect(computeSnap(r(304, 500), others, 6)).toMatchObject({ dx: -4, dy: 0 })
    expect(computeSnap(r(500, 296), others, 6)).toMatchObject({ dx: 0, dy: 4 })
    // left edge (302→300, -2) beats the centre (347→350, +3); the right edge is out of range.
    expect(computeSnap(r(302, 500, 90), others, 6).dx).toBe(-2)
    // an exact centre match (delta 0) wins over a near edge.
    expect(computeSnap(r(302, 500, 96), others, 6).dx).toBe(0)
    expect(computeSnap(r(310, 500), others, 6).dx).toBe(0)
  })

  it('draws a line guide spanning both boxes', () => {
    const { guides } = computeSnap(r(303, 500), [r(300, 300)], 6)
    expect(guides[0]).toMatchObject({ kind: 'line', axis: 'x', position: 300, from: 300, to: 600 })
  })

  it('snaps to equal spacing after a neighbour pair', () => {
    const others = [r(100, 0), r(300, 0)] // gap 100 → next slot starts at 500
    const result = computeSnap(r(505, 20), others, 8)
    expect(result.dx).toBe(-5)
    expect(result.guides.some((g) => g.kind === 'gap')).toBe(true)
  })

  it('snaps to equal spacing before a pair and centred between a pair', () => {
    const others = [r(300, 0), r(500, 0)]
    // before the pair: a.start - gap - size = 300 - 100 - 100 = 100
    expect(computeSnap(r(96, 20), others, 8).dx).toBe(4)
    const between = computeSnap(r(1004, 20), [r(800, 0), r(1200, 0)], 8) // inner = 300-100 = 200 → start 900+100 = 1000
    expect(between.dx).toBe(-4)
  })

  it('ignores boxes that do not overlap on the cross axis for gap matching', () => {
    const others = [r(100, 0), r(300, 0)]
    expect(computeSnap(r(505, 400), others, 8).dx).toBe(0)
  })

  it('returns zero deltas with no candidates or a zero threshold', () => {
    expect(computeSnap(r(0, 0), [], 6)).toEqual({ dx: 0, dy: 0, guides: [] })
    expect(computeSnap(r(3, 0), [r(0, 0)], 0)).toEqual({ dx: 0, dy: 0, guides: [] })
  })
})
