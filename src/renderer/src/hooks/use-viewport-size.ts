import { canvasVideoFocus } from '@/lib/video-expansion'
import { useEffect, type RefObject } from 'react'
import { useCameraStore } from '@/store/camera-store'
import { usePresentationStore } from '@/store/presentation-store'

export function measureViewport(element: HTMLElement): void {
  const { width, height } = element.getBoundingClientRect()
  useCameraStore.getState().setViewport({ width: Math.max(1, width), height: Math.max(1, height) })
}

/** Keeps the camera store's viewport in sync with the container's rendered size. */
export function useViewportSize(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }
    measureViewport(element)
    // Why: fullscreen/window resizes arrive as a burst; refit once the size settles.
    let refitTimer: ReturnType<typeof setTimeout> | null = null
    const observer = new ResizeObserver(() => {
      measureViewport(element)
      if (refitTimer !== null) {
        clearTimeout(refitTimer)
      }
      // An expanded video owns the view now; do not queue a slide refit behind its return button.
      if (canvasVideoFocus.refit()) {
        refitTimer = null
        return
      }
      refitTimer = setTimeout(() => {
        if (!canvasVideoFocus.refit()) {
          usePresentationStore.getState().refitToViewport()
        }
      }, 60)
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      if (refitTimer !== null) {
        clearTimeout(refitTimer)
      }
    }
  }, [ref])
}
