import type { StoreApi } from 'zustand'
import { elementRect } from '@shared/canvas/element-bounds'
import { camerasEqual } from '@shared/canvas/camera-transform'
import { cameraForOverview } from '@shared/canvas/frame-fit'
import { frameIndexById, orderedFrames } from '@shared/canvas/presentation-sequence'
import type { Camera, Rect } from '@shared/canvas/element-types'
import { useCameraStore } from './camera-store'
import { useDocumentStore } from './document-store'
import { frameCamera, frameShotAt, shotTween, type Shot } from './presentation-shot'
import type { PresentationStore } from './presentation-state'

/** Correction hop after a flight lands on a viewport that changed underneath it. */
export const SETTLE_MS = 250

type PresentationApi = Pick<StoreApi<PresentationStore>, 'setState' | 'getState'>

/** Keep camera motion, roll and dimming on the same clock for previews and slide shows. */
export function createPresentationFlights({ setState: set, getState: get }: PresentationApi) {
  const motionAt = (index: number) => frameShotAt(useDocumentStore.getState().document, index)
  const frameTarget = (index: number) =>
    frameCamera(useDocumentStore.getState().document, index, useCameraStore.getState().viewport)
  /** Runs the shot on the camera's eased clock; undefined when the two frames look the same. */
  const shotProgress = (
    to: { roll: number; spotlight: number; rect?: Rect },
    from: Shot = get()
  ) => {
    const tween = shotTween(from, to)
    return tween && ((t: number) => set(tween(t)))
  }
  // Resolve previews by id because the editable deck may reorder or delete the target frame.
  const presentedIndex = (): number | null => {
    const { index, previewFrameId } = get()
    if (previewFrameId === null) {
      return index
    }
    const found = frameIndexById(
      orderedFrames(useDocumentStore.getState().document),
      previewFrameId
    )
    if (found === -1) {
      return null
    }
    if (found !== index) {
      set({ index: found })
    }
    return found
  }
  // Fullscreen may finish resizing after takeoff, so correct the fit against the arrival viewport.
  const settle = (index: number) => {
    const { active, overview, previewFrameId } = get()
    if (!active || overview) {
      return
    }
    const current = presentedIndex()
    if (current === null) {
      return
    }
    // A late correction must not pull a slide show back after it has advanced to another frame.
    if (previewFrameId === null && current !== index) {
      return
    }
    const target = frameTarget(current)
    const camera = useCameraStore.getState()
    if (target && !camerasEqual(camera.camera, target, 0.5)) {
      camera.animateTo(target, SETTLE_MS, { onDone: () => settle(current) })
    }
  }
  // Correction hops override duration; previews also supply a prepared departure and hold.
  const flyToFrame = (
    index: number,
    durationMs?: number,
    holdMs?: number,
    departure?: Camera,
    departureShot?: Shot
  ) => {
    const at = motionAt(index)
    const target = frameTarget(index)
    if (!at || !target) {
      return
    }
    const { motion, frame } = at
    const onProgress = shotProgress(
      {
        roll: motion.roll,
        spotlight: motion.spotlight,
        rect: elementRect(frame)
      },
      departureShot
    )
    useCameraStore.getState().animateTo(target, durationMs ?? motion.ms, {
      rho: motion.arc,
      easing: motion.easing,
      holdMs,
      departure,
      onPrepared: departureShot ? () => set(departureShot) : undefined,
      onProgress,
      onDone: () => settle(index)
    })
  }
  const flyToOverview = (durationMs: number) => {
    const camera = useCameraStore.getState()
    const target = cameraForOverview(useDocumentStore.getState().document, camera.viewport)
    if (!target) {
      return false
    }
    // Overview levels the camera and fades the spotlight where it stands.
    camera.animateTo(target, durationMs, { onProgress: shotProgress({ roll: 0, spotlight: 0 }) })
    return true
  }
  return { motionAt, presentedIndex, flyToFrame, flyToOverview }
}
