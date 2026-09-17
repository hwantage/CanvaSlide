import { useEffect, useState } from 'react'
import {
  ZOOM_SETTLE_MS,
  flightLayoutZoom,
  layoutZoomFor,
  worldLayoutZoom
} from '@shared/canvas/camera-transform'
import { useCameraStore } from '@/store/camera-store'
import { usePresentationStore } from '@/store/presentation-store'

/**
 * The CSS zoom the world is laid out at. A painted (non-composited) world stays at 1 for good and
 * is only ever transformed, so nothing in it reflows (see worldLayoutZoom). A composited world
 * follows the camera zoom, lagging behind gestures: it updates only after the zoom has held still
 * for ZOOM_SETTLE_MS, and a flight holds one layout scale until arrival — the arrival scale
 * itself where the flight allows it (see flightLayoutZoom), so landing has nothing left to reflow.
 */
export function useSettledZoom(composited: boolean): number {
  const stationary = useCameraStore((s) => s.stationaryCamera)
  // The composited world's settled zoom; a painted world ignores it and reads 1 below.
  const [zoom, setZoom] = useState(() => layoutZoomFor(useCameraStore.getState().camera.zoom))
  useEffect(() => {
    if (!composited) {
      return
    }
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
    // Why: the camera may have moved while the world was painted; catch up like after a gesture.
    timer = setTimeout(settle, ZOOM_SETTLE_MS)
    const unsubscribe = useCameraStore.subscribe((state, previous) => {
      if (state.animationActive && !previous.animationActive) {
        setZoom((layout) =>
          state.animationTarget ? flightLayoutZoom(layout, state.animationTarget) : 1
        )
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
  }, [composited])
  return worldLayoutZoom(stationary?.zoom ?? zoom, composited)
}
