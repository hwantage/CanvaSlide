import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ZOOM_SETTLE_MS } from '@shared/canvas/camera-transform'
import { useCameraStore } from '@/store/camera-store'
import { usePresentationStore } from '@/store/presentation-store'
import { useSettledZoom } from './use-settled-zoom'

const initial = useCameraStore.getState()
const initialPresentation = usePresentationStore.getState()

afterEach(() => {
  cleanup()
  useCameraStore.setState(initial, true)
  usePresentationStore.setState(initialPresentation, true)
  vi.useRealTimers()
})

const at = (zoom: number) => ({ x: 0, y: 0, zoom })

describe('settled layout zoom', () => {
  it('preserves a preview hold layout independently of the density threshold', () => {
    vi.useFakeTimers()
    usePresentationStore.setState({ active: true, previewFrameId: 'preview' })
    useCameraStore.setState({ camera: at(4), stationaryCamera: at(8) })
    const { result, rerender } = renderHook(({ denseVectors }) => useSettledZoom(denseVectors), {
      initialProps: { denseVectors: true }
    })
    expect(result.current).toBe(8)
    rerender({ denseVectors: false })
    expect(result.current).toBe(8)
    act(() => useCameraStore.setState({ stationaryCamera: null }))
    expect(result.current).toBe(4)
  })

  it('keeps a light slideshow at 1 through camera changes and flights alike', () => {
    vi.useFakeTimers()
    usePresentationStore.setState({ active: true })
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

  it('keeps the editor layout and pending settle when the document crosses the density threshold', () => {
    vi.useFakeTimers()
    useCameraStore.setState({ camera: at(4) })
    const { result, rerender } = renderHook(({ denseVectors }) => useSettledZoom(denseVectors), {
      initialProps: { denseVectors: true }
    })
    expect(result.current).toBe(4)
    act(() => useCameraStore.setState({ camera: at(2) }))
    act(() => vi.advanceTimersByTime(ZOOM_SETTLE_MS - 1))
    expect(result.current).toBe(4)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(2)
    rerender({ denseVectors: false })
    expect(result.current).toBe(2)
    act(() => useCameraStore.setState({ camera: at(3) }))
    act(() => vi.advanceTimersByTime(ZOOM_SETTLE_MS - 1))
    rerender({ denseVectors: true })
    expect(result.current).toBe(2)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(3)
  })

  it('restores editor resolution after a light slideshow', () => {
    vi.useFakeTimers()
    useCameraStore.setState({ camera: at(2.4) })
    const { result } = renderHook(() => useSettledZoom(false))
    expect(result.current).toBe(2.4)
    act(() => usePresentationStore.setState({ active: true, previewFrameId: null }))
    expect(result.current).toBe(1)
    expect(vi.getTimerCount()).toBe(0)
    act(() => useCameraStore.setState({ camera: at(4) }))
    act(() => usePresentationStore.setState({ active: false, previewFrameId: null }))
    expect(result.current).toBe(1)
    act(() => vi.advanceTimersByTime(ZOOM_SETTLE_MS))
    expect(result.current).toBe(4)
  })

  it.each([false, true])(
    'settles a preview immediately on landing (denseVectors=%s)',
    (denseVectors) => {
      vi.useFakeTimers()
      const isAnimating = vi.fn(() => false)
      useCameraStore.setState({ camera: at(1), isAnimating })
      const { result } = renderHook(() => useSettledZoom(denseVectors))
      act(() => usePresentationStore.setState({ active: true, previewFrameId: 'preview' }))
      isAnimating.mockReturnValue(true)
      act(() => useCameraStore.setState({ animationActive: true, animationTarget: at(2.4) }))
      act(() => useCameraStore.setState({ camera: at(2.4) }))
      act(() => vi.advanceTimersByTime(ZOOM_SETTLE_MS * 3))
      expect(result.current).toBe(1)
      isAnimating.mockReturnValue(false)
      act(() => useCameraStore.setState({ animationActive: false, animationTarget: null }))
      expect(result.current).toBe(2.4)
      expect(vi.getTimerCount()).toBe(0)
      act(() => usePresentationStore.setState({ active: false, previewFrameId: null }))
      expect(result.current).toBe(2.4)
    }
  )
})

describe.each([false, true])('editor settled layout zoom (denseVectors=%s)', (denseVectors) => {
  it('debounces wheel and pinch updates until the latest zoom has held still', () => {
    vi.useFakeTimers()
    useCameraStore.setState({ camera: at(1.6) })
    const { result } = renderHook(() => useSettledZoom(denseVectors))
    expect(result.current).toBe(1.6)
    for (const zoom of [2, 2.4, 1.8]) {
      act(() => useCameraStore.setState({ camera: at(zoom) }))
      act(() => vi.advanceTimersByTime(ZOOM_SETTLE_MS - 1))
      expect(result.current).toBe(1.6)
    }
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(1.8)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not mistake a stalled animation for a settled camera', () => {
    vi.useFakeTimers()
    const isAnimating = vi.fn(() => true)
    useCameraStore.setState({ camera: at(8), isAnimating })
    const { result } = renderHook(() => useSettledZoom(denseVectors))
    act(() => useCameraStore.setState({ camera: at(2) }))
    act(() => vi.advanceTimersByTime(ZOOM_SETTLE_MS * 5))
    expect(result.current).toBe(8)
    isAnimating.mockReturnValue(false)
    act(() => vi.advanceTimersByTime(ZOOM_SETTLE_MS))
    expect(result.current).toBe(2)
  })

  it('flies at the arrival scale when that does not raise the departure layout', () => {
    vi.useFakeTimers()
    const isAnimating = vi.fn(() => true)
    useCameraStore.setState({ camera: at(1.174), isAnimating })
    const { result } = renderHook(() => useSettledZoom(denseVectors))
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
    const { result, unmount } = renderHook(() => useSettledZoom(denseVectors))
    act(() => useCameraStore.setState({ camera: at(0.02) }))
    act(() => vi.advanceTimersByTime(ZOOM_SETTLE_MS))
    expect(result.current).toBe(1)
    act(() => useCameraStore.setState({ camera: at(3) }))
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
