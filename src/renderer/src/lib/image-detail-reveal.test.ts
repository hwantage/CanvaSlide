import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DETAIL_REVEAL_DEADLINE_MS,
  detailPainted,
  detailRevealed,
  expectDetail,
  resetDetailReveal,
  subscribeDetailReveal,
  withdrawDetail
} from './image-detail-reveal'

const camera = { x: 1, y: 2, zoom: 3 }

afterEach(() => {
  resetDetailReveal()
  vi.useRealTimers()
})

describe('image detail reveal', () => {
  it('shows every image at once when all of them have painted', () => {
    vi.useFakeTimers()
    const listener = vi.fn()
    subscribeDetailReveal(listener)
    expectDetail(camera, 'a')
    expectDetail(camera, 'b')
    detailPainted(camera, 'a')
    expect(detailRevealed(camera)).toBe(false)
    expect(listener).not.toHaveBeenCalled()
    detailPainted(camera, 'b')
    expect(detailRevealed(camera)).toBe(true)
    expect(listener).toHaveBeenCalledOnce()
    // A late arrival after the reveal shows on its own.
    expectDetail(camera, 'c')
    expect(detailRevealed(camera)).toBe(true)
  })

  it('gives up once no further render has landed for the deadline, and stops waiting for a withdrawn one', () => {
    vi.useFakeTimers()
    expectDetail(camera, 'a')
    expectDetail(camera, 'b')
    expectDetail(camera, 'c')
    detailPainted(camera, 'a')
    vi.advanceTimersByTime(DETAIL_REVEAL_DEADLINE_MS - 1)
    // Progress restarts the wait: the second image came in time, the third never does.
    detailPainted(camera, 'b')
    vi.advanceTimersByTime(DETAIL_REVEAL_DEADLINE_MS - 1)
    expect(detailRevealed(camera)).toBe(false)
    vi.advanceTimersByTime(1)
    expect(detailRevealed(camera)).toBe(true)

    const next = { x: 5, y: 6, zoom: 7 }
    expectDetail(next, 'a')
    expectDetail(next, 'b')
    detailPainted(next, 'a')
    expect(detailRevealed(next)).toBe(false)
    withdrawDetail(next, 'b')
    expect(detailRevealed(next)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('starts over for a new camera', () => {
    vi.useFakeTimers()
    expectDetail(camera, 'a')
    detailPainted(camera, 'a')
    expect(detailRevealed(camera)).toBe(true)
    const next = { x: 5, y: 6, zoom: 7 }
    expectDetail(next, 'a')
    expect(detailRevealed(camera)).toBe(false)
    expect(detailRevealed(next)).toBe(false)
  })
})
