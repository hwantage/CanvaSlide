import { describe, expect, it } from 'vitest'
import {
  SWIPE_MAX_DURATION_MS,
  SWIPE_MIN_TRAVEL_PX,
  presentationSwipeAction,
  type SwipePoint
} from './presentation-swipe'

function swipe(from: [number, number], to: [number, number], durationMs: number) {
  const start: SwipePoint = { x: from[0], y: from[1], time: 1000 }
  const end: SwipePoint = { x: to[0], y: to[1], time: 1000 + durationMs }
  return presentationSwipeAction(start, end)
}

describe('presentationSwipeAction', () => {
  it('steps the deck on a horizontal flick, following the finger', () => {
    expect(swipe([300, 400], [200, 410], 180)).toBe('next')
    expect(swipe([100, 400], [200, 390], 180)).toBe('previous')
  })

  it('needs the full travel before it steps', () => {
    expect(swipe([200, 400], [200 - (SWIPE_MIN_TRAVEL_PX - 1), 400], 180)).toBeNull()
    expect(swipe([200, 400], [200 - SWIPE_MIN_TRAVEL_PX, 400], 180)).toBe('next')
  })

  it('ignores a slow drag, so a gesture the reader is still shaping is left alone', () => {
    expect(swipe([300, 400], [180, 400], SWIPE_MAX_DURATION_MS)).toBe('next')
    expect(swipe([300, 400], [180, 400], SWIPE_MAX_DURATION_MS + 1)).toBeNull()
  })

  it('ignores travel that leans vertical', () => {
    expect(swipe([300, 200], [220, 240], 180)).toBe('next')
    expect(swipe([300, 200], [220, 300], 180)).toBeNull()
    expect(swipe([300, 200], [300, 100], 180)).toBeNull()
  })

  it('never steps on a tap, however long it is held', () => {
    expect(swipe([200, 400], [200, 400], 40)).toBeNull()
    expect(swipe([200, 400], [204, 402], 900)).toBeNull()
    // Why: taps belong to the slide's own content — video controls, links, future interactions.
    expect(swipe([8, 400], [8, 400], 60)).toBeNull()
  })
})
