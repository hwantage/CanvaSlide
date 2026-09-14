import { describe, expect, it } from 'vitest'
import { edgeScrollVelocity, gapAtPointer } from './list-drop-gap'

describe('list-drop-gap', () => {
  it('counts the midpoints above the pointer', () => {
    const mids = [20, 60, 100]
    expect(gapAtPointer(mids, 0)).toBe(0)
    expect(gapAtPointer(mids, 20)).toBe(0)
    expect(gapAtPointer(mids, 21)).toBe(1)
    expect(gapAtPointer(mids, 99)).toBe(2)
    expect(gapAtPointer(mids, 500)).toBe(3)
    expect(gapAtPointer([], 10)).toBe(0)
  })

  it('scrolls faster the deeper the pointer is in the edge zone', () => {
    expect(edgeScrollVelocity(0, 40)).toBe(0)
    expect(edgeScrollVelocity(10, 40)).toBe(5)
    expect(edgeScrollVelocity(40, 40)).toBe(18)
    expect(edgeScrollVelocity(400, 40)).toBe(18)
  })
})
