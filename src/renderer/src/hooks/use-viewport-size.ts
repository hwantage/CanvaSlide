import { canvasVideoFocus } from '@/lib/video-expansion'
import { useEffect, type RefObject } from 'react'
import { createViewportRefit } from '@shared/presentation/viewport-refit'
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
    const refit = createViewportRefit({
      refitMedia: canvasVideoFocus.refit,
      refit: () => usePresentationStore.getState().refitToViewport()
    })
    const observer = new ResizeObserver(() => {
      measureViewport(element)
      refit.request()
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      refit.cancel()
    }
  }, [ref])
}
