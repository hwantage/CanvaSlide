import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REFIT_DELAY_MS, createViewportRefit } from './viewport-refit'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('viewport refit', () => {
  it('refits once after a burst of resizes settles', () => {
    const refit = vi.fn()
    const scheduler = createViewportRefit({ refitMedia: () => false, refit })
    for (let i = 0; i < 5; i++) {
      scheduler.request()
      vi.advanceTimersByTime(REFIT_DELAY_MS - 1)
    }
    expect(refit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(refit).toHaveBeenCalledTimes(1)
  })

  it('lets an expanded video refit at once and queues no slide refit behind it', () => {
    const refit = vi.fn()
    let expanded = false
    const refitMedia = vi.fn(() => expanded)
    const scheduler = createViewportRefit({ refitMedia, refit })
    scheduler.request()
    expanded = true
    scheduler.request()
    expect(refitMedia).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(REFIT_DELAY_MS)
    expect(refit).not.toHaveBeenCalled()
  })

  it('skips the slide refit if a video expanded while the burst settled', () => {
    const refit = vi.fn()
    let expanded = false
    const scheduler = createViewportRefit({ refitMedia: () => expanded, refit })
    scheduler.request()
    expanded = true
    vi.advanceTimersByTime(REFIT_DELAY_MS)
    expect(refit).not.toHaveBeenCalled()
  })

  it('drops a pending refit when cancelled', () => {
    const refit = vi.fn()
    const scheduler = createViewportRefit({ refitMedia: () => false, refit })
    scheduler.request()
    scheduler.cancel()
    vi.advanceTimersByTime(REFIT_DELAY_MS)
    expect(refit).not.toHaveBeenCalled()
  })
})
