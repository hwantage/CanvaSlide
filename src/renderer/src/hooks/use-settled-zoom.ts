import { useEffect, useState } from 'react'
import { ZOOM_SETTLE_MS, layoutZoomFor } from '@shared/canvas/camera-transform'
import { useCameraStore } from '@/store/camera-store'

/**
 * The CSS zoom the world is laid out at, lagging behind gestures: it updates only after the camera
 * zoom has held still for ZOOM_SETTLE_MS, and never drops below 1 (see layoutZoomFor). The world
 * layer covers the difference with a compositor-only transform, so wheel zoom and slide
 * transitions never trigger a full re-layout.
 */
export function useSettledZoom(): number {
  const [zoom, setZoom] = useState(() => layoutZoomFor(useCameraStore.getState().camera.zoom))
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = useCameraStore.subscribe((state, previous) => {
      if (state.camera.zoom === previous.camera.zoom) {
        return
      }
      if (timer !== null) {
        clearTimeout(timer)
      }
      timer = setTimeout(() => {
        timer = null
        setZoom(layoutZoomFor(useCameraStore.getState().camera.zoom))
      }, ZOOM_SETTLE_MS)
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
