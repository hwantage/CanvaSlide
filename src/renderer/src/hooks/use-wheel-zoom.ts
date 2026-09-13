import { useEffect, type RefObject } from 'react'
import { PINCH_DELTA_LIMIT, PINCH_ZOOM_MULTIPLIER } from '@shared/canvas/camera-transform'
import { useCameraStore } from '@/store/camera-store'
import { usePresentationStore } from '@/store/presentation-store'

type GestureEventLike = Event & { scale: number; clientX: number; clientY: number }

// Why: Chromium/Firefox turn a trackpad pinch into ctrl+wheel with small deltas, while WebKit
// dispatches proprietary gesture events. Handle both, never twice.
export function useWheelZoom(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }
    let gestureStartZoom: number | null = null

    const anchorFor = (event: { clientX: number; clientY: number }) => {
      const bounds = element.getBoundingClientRect()
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      if (usePresentationStore.getState().active || gestureStartZoom !== null) {
        return
      }
      const camera = useCameraStore.getState()
      if (event.ctrlKey || event.metaKey) {
        // Why: line/page delta modes report tiny numbers; normalize to pixels.
        const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1
        const isPinch =
          event.ctrlKey && event.deltaMode === 0 && Math.abs(event.deltaY) < PINCH_DELTA_LIMIT
        camera.zoomByWheel(
          anchorFor(event),
          event.deltaY * scale,
          isPinch ? PINCH_ZOOM_MULTIPLIER : 1
        )
        return
      }
      camera.panBy(-event.deltaX, -event.deltaY)
    }

    const onGestureStart = (event: Event) => {
      event.preventDefault()
      gestureStartZoom = useCameraStore.getState().camera.zoom
    }
    const onGestureChange = (event: Event) => {
      event.preventDefault()
      const gesture = event as GestureEventLike
      if (gestureStartZoom === null || usePresentationStore.getState().active) {
        return
      }
      useCameraStore
        .getState()
        .zoomAtScreenPoint(
          anchorFor(gesture),
          gestureStartZoom * gesture.scale ** PINCH_ZOOM_MULTIPLIER
        )
    }
    const onGestureEnd = (event: Event) => {
      event.preventDefault()
      gestureStartZoom = null
    }

    element.addEventListener('wheel', onWheel, { passive: false })
    element.addEventListener('gesturestart', onGestureStart)
    element.addEventListener('gesturechange', onGestureChange)
    element.addEventListener('gestureend', onGestureEnd)
    return () => {
      element.removeEventListener('wheel', onWheel)
      element.removeEventListener('gesturestart', onGestureStart)
      element.removeEventListener('gesturechange', onGestureChange)
      element.removeEventListener('gestureend', onGestureEnd)
    }
  }, [ref])
}
