import { useEffect, useState } from 'react'
import { ZOOM_SETTLE_MS, layoutZoomFor } from '@shared/canvas/camera-transform'
import { useCameraStore } from '@/store/camera-store'

/**
 * The CSS zoom the world is laid out at, lagging behind gestures: it updates only after the camera
 * zoom has held still for ZOOM_SETTLE_MS, and never drops below 1 (see layoutZoomFor). The world
 * layer covers the difference with a compositor-only transform, so wheel zoom and slide
 * transitions hold one layout scale until arrival.
 */
export function useSettledZoom(): number {
  const [zoom, setZoom] = useState(() => layoutZoomFor(useCameraStore.getState().camera.zoom))
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const settle = () => {
      // A delayed animation frame is not the end of a camera flight.
      if (useCameraStore.getState().isAnimating()) {
        timer = setTimeout(settle, ZOOM_SETTLE_MS)
        return
      }
      timer = null
      setZoom(layoutZoomFor(useCameraStore.getState().camera.zoom))
    }
    const unsubscribe = useCameraStore.subscribe((state, previous) => {
      // A large departure scale makes WebKit rasterize newly visible SVGs before downscaling them.
      if (state.animationActive && !previous.animationActive) {
        setZoom(1)
      }
      if (
        state.camera.zoom === previous.camera.zoom &&
        state.animationActive === previous.animationActive
      ) {
        return
      }
      if (timer !== null) {
        clearTimeout(timer)
      }
      timer = setTimeout(settle, ZOOM_SETTLE_MS)
    })
    return () => {
      unsubscribe()
      if (timer !== null) {
        clearTimeout(timer)
      }
    }
  }, [])
  return zoom
}
