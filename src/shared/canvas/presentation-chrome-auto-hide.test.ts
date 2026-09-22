import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CHROME_HOT_ZONE_PX,
  CHROME_IDLE_MS,
  createChromeAutoHide,
  inChromeHotZone
} from './presentation-chrome-auto-hide'

afterEach(() => {
  vi.useRealTimers()
})

const VIEWPORT_HEIGHT = 900

describe('chrome hot zone', () => {
  it('covers the bottom strip of the viewport and nothing above it', () => {
    const top = VIEWPORT_HEIGHT - CHROME_HOT_ZONE_PX
    expect(inChromeHotZone(top - 1, VIEWPORT_HEIGHT)).toBe(false)
    expect(inChromeHotZone(top, VIEWPORT_HEIGHT)).toBe(true)
    expect(inChromeHotZone(VIEWPORT_HEIGHT, VIEWPORT_HEIGHT)).toBe(true)
    // Below the viewport edge (a drag past the window) still counts as the bottom.
    expect(inChromeHotZone(VIEWPORT_HEIGHT + 40, VIEWPORT_HEIGHT)).toBe(true)
    expect(inChromeHotZone(0, VIEWPORT_HEIGHT)).toBe(false)
  })

  it('follows a custom hot zone height', () => {
    expect(inChromeHotZone(850, VIEWPORT_HEIGHT, 40)).toBe(false)
    expect(inChromeHotZone(870, VIEWPORT_HEIGHT, 40)).toBe(true)
  })
})

describe('presentation chrome auto-hide', () => {
  it('hides once the pointer has rested for the idle period', () => {
    vi.useFakeTimers()
    const changed = vi.fn()
    createChromeAutoHide(changed)
    vi.advanceTimersByTime(CHROME_IDLE_MS - 1)
    expect(changed).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(changed).toHaveBeenCalledExactlyOnceWith(false)
  })

  it('restarts the idle wait while the pointer keeps moving, wherever it moves', () => {
    vi.useFakeTimers()
    const changed = vi.fn()
    const chrome = createChromeAutoHide(changed)
    for (let step = 0; step < 4; step++) {
      vi.advanceTimersByTime(CHROME_IDLE_MS - 100)
      chrome.pointerMovedTo(100, VIEWPORT_HEIGHT)
    }
    expect(changed).not.toHaveBeenCalled()
    vi.advanceTimersByTime(CHROME_IDLE_MS)
    expect(changed).toHaveBeenCalledExactlyOnceWith(false)
  })

  it('stays away while the pointer moves outside the hot zone, and returns inside it', () => {
    vi.useFakeTimers()
    const changed = vi.fn()
    const chrome = createChromeAutoHide(changed)
    vi.advanceTimersByTime(CHROME_IDLE_MS)
    expect(changed).toHaveBeenLastCalledWith(false)
    chrome.pointerMovedTo(VIEWPORT_HEIGHT / 2, VIEWPORT_HEIGHT)
    expect(changed).toHaveBeenCalledOnce()
    chrome.pointerMovedTo(VIEWPORT_HEIGHT - 20, VIEWPORT_HEIGHT)
    expect(changed).toHaveBeenLastCalledWith(true)
    // The reveal restarts the idle wait rather than leaving the bar up for good.
    vi.advanceTimersByTime(CHROME_IDLE_MS)
    expect(changed).toHaveBeenLastCalledWith(false)
    expect(changed).toHaveBeenCalledTimes(3)
  })

  it('reveals on an explicit keyboard request', () => {
    vi.useFakeTimers()
    const changed = vi.fn()
    const chrome = createChromeAutoHide(changed)
    vi.advanceTimersByTime(CHROME_IDLE_MS)
    chrome.reveal()
    expect(changed).toHaveBeenLastCalledWith(true)
    vi.advanceTimersByTime(CHROME_IDLE_MS)
    expect(changed).toHaveBeenLastCalledWith(false)
  })

  it('never hides under a resting pointer or away from the keyboard', () => {
    vi.useFakeTimers()
    const changed = vi.fn()
    const chrome = createChromeAutoHide(changed)
    chrome.hold('pointer', true)
    chrome.hold('focus', true)
    vi.advanceTimersByTime(CHROME_IDLE_MS * 4)
    expect(changed).not.toHaveBeenCalled()
    // One hold released is not the other: tabbing between the bar's buttons keeps it open.
    chrome.hold('focus', false)
    vi.advanceTimersByTime(CHROME_IDLE_MS * 2)
    expect(changed).not.toHaveBeenCalled()
    chrome.hold('pointer', false)
    vi.advanceTimersByTime(CHROME_IDLE_MS)
    expect(changed).toHaveBeenCalledExactlyOnceWith(false)
  })

  it('brings a hidden bar back when focus lands inside it', () => {
    vi.useFakeTimers()
    const changed = vi.fn()
    const chrome = createChromeAutoHide(changed)
    vi.advanceTimersByTime(CHROME_IDLE_MS)
    expect(changed).toHaveBeenLastCalledWith(false)
    chrome.hold('focus', true)
    expect(changed).toHaveBeenLastCalledWith(true)
  })

  it('honours a custom idle period and stops timing once disposed', () => {
    vi.useFakeTimers()
    const changed = vi.fn()
    const chrome = createChromeAutoHide(changed, { idleMs: 400 })
    vi.advanceTimersByTime(400)
    expect(changed).toHaveBeenCalledExactlyOnceWith(false)
    chrome.reveal()
    chrome.dispose()
    vi.advanceTimersByTime(CHROME_IDLE_MS * 4)
    expect(changed).toHaveBeenCalledTimes(2)
  })
})
