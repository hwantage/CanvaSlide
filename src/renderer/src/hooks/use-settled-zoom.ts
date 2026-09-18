import { useEffect, useState } from 'react'
import {
  ZOOM_SETTLE_MS,
  flightLayoutZoom,
  layoutZoomFor,
  worldLayoutZoom
} from '@shared/canvas/camera-transform'
import { useCameraStore } from '@/store/camera-store'
import { selectSlideShowActive, usePresentationStore } from '@/store/presentation-store'

/**
 * The CSS zoom the world is laid out at. Light slideshows keep a fixed layout to avoid text
 * reflow (see worldLayoutZoom). Editing, previews and composited slideshows follow the camera zoom,
 * lagging behind gestures: the layout updates only after the zoom has held still
 * for ZOOM_SETTLE_MS, and a flight holds one layout scale until arrival — the arrival scale
 * itself where the flight allows it (see flightLayoutZoom), so landing has nothing left to reflow.
 */
export function useSettledZoom(composited: boolean): number {
  const stationary = useCameraStore((s) => s.stationaryCamera)
  const slideShowActive = usePresentationStore(selectSlideShowActive)
  const fixedLayout = slideShowActive && !composited
  // A light slideshow resets the settled zoom so returning to editing catches up once at rest.
  const [zoom, setZoom] = useState(() => layoutZoomFor(useCameraStore.getState().camera.zoom))
  if (fixedLayout && zoom !== 1) {
    setZoom(1)
  }
  useEffect(() => {
    if (fixedLayout) {
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
    // Why: the camera may have moved during a light slideshow; catch up like after a gesture.
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
  }, [fixedLayout])
  return worldLayoutZoom(stationary?.zoom ?? zoom, composited, slideShowActive)
}
