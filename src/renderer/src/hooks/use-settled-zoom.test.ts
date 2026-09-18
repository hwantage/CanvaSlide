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

const at = (zoom: number) => ({ x: 0, y: 0, zoom })

describe('settled layout zoom', () => {
  it('preserves a preview hold layout only for a composited world', () => {
    vi.useFakeTimers()
    useCameraStore.setState({ camera: at(4), stationaryCamera: at(8) })
    const { result, rerender } = renderHook(({ composited }) => useSettledZoom(composited), {
      initialProps: { composited: true }
    })
    expect(result.current).toBe(8)
    rerender({ composited: false })
    expect(result.current).toBe(1)
    act(() => useCameraStore.setState({ stationaryCamera: null }))
    expect(result.current).toBe(1)
  })

  it('keeps a painted world at 1 through wheel zoom and flights alike', () => {
    vi.useFakeTimers()
    useCameraStore.setState({ camera: at(4) })
    const { result } = renderHook(() => useSettledZoom(false))
    expect(result.current).toBe(1)
    act(() => useCameraStore.setState({ camera: at(8) }))
    act(() => vi.advanceTimersByTime(ZOOM_SETTLE_MS * 2))
    expect(result.current).toBe(1)
    act(() => useCameraStore.setState({ animationActive: true, animationTarget: at(2) }))
    expect(result.current).toBe(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('follows the zoom of a composited world once it settles, and drops back to 1 for a painted one', () => {
    vi.useFakeTimers()
    useCameraStore.setState({ camera: at(4) })
    const { result, rerender } = renderHook(({ composited }) => useSettledZoom(composited), {
      initialProps: { composited: true }
    })
    expect(result.current).toBe(4)
    act(() => useCameraStore.setState({ camera: at(2) }))
    act(() => vi.advanceTimersByTime(ZOOM_SETTLE_MS - 1))
    expect(result.current).toBe(4)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(2)
    rerender({ composited: false })
    expect(result.current).toBe(1)
    act(() => useCameraStore.setState({ camera: at(3) }))
    rerender({ composited: true })
    expect(result.current).toBe(1)
    act(() => vi.advanceTimersByTime(ZOOM_SETTLE_MS))
    expect(result.current).toBe(3)
  })

  it('does not mistake a stalled animation for a settled camera', () => {
    vi.useFakeTimers()
    const isAnimating = vi.fn(() => true)
    useCameraStore.setState({ camera: at(8), isAnimating })
    const { result } = renderHook(() => useSettledZoom(true))
    act(() => useCameraStore.setState({ camera: at(2) }))
    act(() => vi.advanceTimersByTime(ZOOM_SETTLE_MS * 5))
    expect(result.current).toBe(8)
    isAnimating.mockReturnValue(false)
    act(() => vi.advanceTimersByTime(ZOOM_SETTLE_MS))
    expect(result.current).toBe(2)
  })

  it('flies a composited world at its arrival scale when that does not raise the departure layout', () => {
    vi.useFakeTimers()
    const isAnimating = vi.fn(() => true)
    useCameraStore.setState({ camera: at(1.174), isAnimating })
    const { result } = renderHook(() => useSettledZoom(true))
    expect(result.current).toBe(1.174)
    // Same-scale hop: nothing changes at departure, nothing at arrival.
    act(() =>
      useCameraStore.setState({
        animationActive: true,
        animationTarget: { x: -900, y: 0, zoom: 1.174 }
      })
    )
    expect(result.current).toBe(1.174)
    act(() => useCameraStore.setState({ camera: { x: -900, y: 0, zoom: 1.174 } }))
    isAnimating.mockReturnValue(false)
    act(() => useCameraStore.setState({ animationActive: false, animationTarget: null }))
    act(() => vi.advanceTimersByTime(ZOOM_SETTLE_MS))
    expect(result.current).toBe(1.174)
    // Zooming out lands lower: the flight is laid out at the arrival scale from the start.
    isAnimating.mockReturnValue(true)
    act(() => useCameraStore.setState({ animationActive: true, animationTarget: at(0.5) }))
    expect(result.current).toBe(1)
    act(() =>
      useCameraStore.setState({ camera: at(0.5), animationActive: false, animationTarget: null })
    )
    // Zooming in would lay the world out above the camera: hold 1 until arrival.
    act(() => useCameraStore.setState({ animationActive: true, animationTarget: at(4) }))
    expect(result.current).toBe(1)
    act(() => useCameraStore.setState({ camera: at(4) }))
    isAnimating.mockReturnValue(false)
    act(() => useCameraStore.setState({ animationActive: false, animationTarget: null }))
    act(() => vi.advanceTimersByTime(ZOOM_SETTLE_MS))
    expect(result.current).toBe(4)
  })

  it('keeps the font-size floor and cleans up a pending timer', () => {
    vi.useFakeTimers()
    useCameraStore.setState({ camera: at(4) })
    const { result, unmount } = renderHook(() => useSettledZoom(true))
    act(() => useCameraStore.setState({ camera: at(0.02) }))
    act(() => vi.advanceTimersByTime(ZOOM_SETTLE_MS))
    expect(result.current).toBe(1)
    act(() => useCameraStore.setState({ camera: at(3) }))
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
