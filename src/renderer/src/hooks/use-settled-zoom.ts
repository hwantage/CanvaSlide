import { useEffect, useState } from 'react'
import { ZOOM_SETTLE_MS, layoutZoomFor } from '@shared/canvas/camera-transform'
import { useCameraStore } from '@/store/camera-store'
import { usePresentationStore } from '@/store/presentation-store'

/** Defer gesture relayout while preserving the prepared still of a preview. */
export function useSettledZoom(): number {
  const stationary = useCameraStore((s) => s.stationaryCamera)
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
      // Preview landings can reveal retained detail immediately; ordinary flights keep their delay.
      if (
        !state.animationActive &&
        previous.animationActive &&
        usePresentationStore.getState().previewFrameId !== null
      ) {
        settle()
      } else {
        timer = setTimeout(settle, ZOOM_SETTLE_MS)
      }
    })
    return () => {
      unsubscribe()
      if (timer !== null) {
        clearTimeout(timer)
      }
    }
  }, [])
  return stationary ? layoutZoomFor(stationary.zoom) : zoom
}
