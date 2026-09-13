import { describe, expect, it } from 'vitest'
import { FRAME_FROM_SELECTION_PADDING, frameRectAround } from './frame-from-selection'

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
