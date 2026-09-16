import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ZOOM_SETTLE_MS } from '@shared/canvas/camera-transform'
import { useCameraStore } from '@/store/camera-store'
import { useSettledZoom } from './use-settled-zoom'

const initial = useCameraStore.getState()

afterEach(() => {
  cleanup()
  useCameraStore.setState(initial, true)
  vi.useRealTimers()
})

describe('settled layout zoom', () => {
  it('does not mistake a stalled animation for a settled camera', () => {
    vi.useFakeTimers()
    const isAnimating = vi.fn(() => true)
    useCameraStore.setState({ camera: { x: 0, y: 0, zoom: 8 }, isAnimating })
    const { result } = renderHook(useSettledZoom)
    act(() => useCameraStore.setState({ camera: { x: 0, y: 0, zoom: 2 } }))
    act(() => vi.advanceTimersByTime(ZOOM_SETTLE_MS * 5))
    expect(result.current).toBe(8)
    isAnimating.mockReturnValue(false)
    act(() => vi.advanceTimersByTime(ZOOM_SETTLE_MS))
    expect(result.current).toBe(2)
  })

  it('debounces wheel zoom, keeps the font-size floor, and cleans up a pending timer', () => {
    vi.useFakeTimers()
    useCameraStore.setState({ camera: { x: 0, y: 0, zoom: 4 } })
    const { result, unmount } = renderHook(useSettledZoom)
    act(() => useCameraStore.setState({ camera: { x: 0, y: 0, zoom: 2 } }))
    act(() => vi.advanceTimersByTime(ZOOM_SETTLE_MS - 1))
    expect(result.current).toBe(4)
    act(() => useCameraStore.setState({ camera: { x: 0, y: 0, zoom: 0.02 } }))
    act(() => vi.advanceTimersByTime(ZOOM_SETTLE_MS))
    expect(result.current).toBe(1)
    act(() => useCameraStore.setState({ camera: { x: 0, y: 0, zoom: 3 } }))
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
