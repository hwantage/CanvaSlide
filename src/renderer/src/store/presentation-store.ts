import { create } from 'zustand'
import { previewDepartureHoldMs } from '@shared/canvas/departure-hold'
import { frameIndexById, orderedFrames, stepFrameIndex } from '@shared/canvas/presentation-sequence'
import { camerasEqual } from '@shared/canvas/camera-transform'
import { cameraForOverview } from '@shared/canvas/frame-fit'
import type { Camera, ElementId, Rect } from '@shared/canvas/element-types'
import {
  LEVEL_SHOT,
  frameCamera,
  frameShot,
  frameShotAt,
  previewDeparture,
  shotTween,
  type Shot
} from '@shared/canvas/presentation-shot'
import { useCameraStore } from './camera-store'
import { setWindowFullscreen } from '@/platform/window-fullscreen'
import { useDocumentStore } from './document-store'

export type PresentationState = {
  active: boolean
  index: number
  /** Camera to restore on exit. */
  cameraBeforeStart: Camera | null
  /** Zoomed out to the whole board; frames become clickable jump targets. */
  overview: boolean
  /** Camera roll in degrees. Presentation only; the editor never rolls. */
  roll: number
  /** Dim strength outside `spotlightRect`, 0 = off. */
  spotlight: number
  /** The cut-out, in world units. It travels with the flight instead of jumping to the target. */
  spotlightRect: Rect | null
  /** Keep previews anchored through reordering; null for ordinary slide shows. */
  previewFrameId: ElementId | null
}

export type PresentationActions = {
  start: (fromIndex?: number) => void
  /** Show the preceding frame before flying in; the opening frame needs no departure hold. */
  previewTransition: (frameId: ElementId) => void
  /** Drops a parked preview where it stands, for when the editor is about to move the camera itself. */
  cancelPreview: () => void
  /** Called by the viewport once it has re-measured after chrome hides. */
  flyToCurrent: () => void
  exit: () => void
  next: () => void
  previous: () => void
  goTo: (index: number) => void
  showOverview: () => void
  toggleOverview: () => void
  /** Viewport changed (fullscreen transition, window resize): keep the current target fitted. */
  refitToViewport: () => void
}

export type PresentationStore = PresentationState & PresentationActions

/** Correction hop after a flight lands on a viewport that changed underneath it. */
const SETTLE_MS = 250

export const usePresentationStore = create<PresentationStore>()((set, get) => {
  const motionAt = (index: number) => frameShotAt(useDocumentStore.getState().document, index)
  const frameTarget = (index: number) =>
    frameCamera(useDocumentStore.getState().document, index, useCameraStore.getState().viewport)
  /** Runs the shot on the camera's eased clock; undefined when the two frames look the same. */
  const shotProgress = (to: Shot, from: Shot = get()) => {
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
  /** Correction hops override the duration; a preview also opens on a prepared departure still. */
  type Flight = {
    durationMs?: number
    /** Where the camera and the shot rest before the flight, and for how long. */
    departure?: { camera: Camera | null; shot: Shot; holdMs: number }
  }
  const flyToFrame = (index: number, { durationMs, departure }: Flight = {}) => {
    const at = motionAt(index)
    const target = frameTarget(index)
    if (!at || !target) {
      return
    }
    const onProgress = shotProgress(frameShot(at), departure?.shot)
    useCameraStore.getState().animateTo(target, durationMs ?? at.motion.ms, {
      rho: at.motion.arc,
      easing: at.motion.easing,
      holdMs: departure?.holdMs,
      departure: departure?.camera ?? undefined,
      onPrepared: departure ? () => set(departure.shot) : undefined,
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
    camera.animateTo(target, durationMs, { onProgress: shotProgress(LEVEL_SHOT) })
    return true
  }

  const step = (direction: 1 | -1) => {
    const { active, index } = get()
    if (!active) {
      return
    }
    const document = useDocumentStore.getState().document
    const count = orderedFrames(document).length
    const nextIndex = stepFrameIndex(index, count, direction)
    if (nextIndex === index) {
      // Why: at either end, arrow keys still leave overview and return to the current frame.
      if (get().overview) {
        get().goTo(index)
      }
      return
    }
    set({ index: nextIndex, overview: false })
    flyToFrame(nextIndex)
  }
  /** The level, lit, inactive state both ways out of presenting land on. */
  const clearPresentation = () =>
    set({
      ...LEVEL_SHOT,
      active: false,
      overview: false,
      cameraBeforeStart: null,
      previewFrameId: null
    })
  const showOverview = () => {
    if (!get().active) {
      return
    }
    const { transitionMs } = useDocumentStore.getState().document.settings
    if (flyToOverview(transitionMs)) {
      set({ overview: true })
    }
  }

  return {
    ...LEVEL_SHOT,
    active: false,
    index: 0,
    cameraBeforeStart: null,
    overview: false,
    previewFrameId: null,
    start: (fromIndex = 0) => {
      const documentStore = useDocumentStore.getState()
      const count = orderedFrames(documentStore.document).length
      if (count === 0) {
        return
      }
      documentStore.clearSelection()
      const index = Math.min(fromIndex, count - 1)
      // Why: a preview still resting on its departure would otherwise take off under the slide show.
      useCameraStore.getState().cancelAnimation()
      set({
        ...LEVEL_SHOT,
        active: true,
        index,
        overview: false,
        previewFrameId: null,
        cameraBeforeStart: useCameraStore.getState().camera
      })
      // Refit after the OS finishes fullscreen, even if it skipped intermediate resize events.
      void setWindowFullscreen(true).then(() => get().refitToViewport())
    },
    previewTransition: (frameId) => {
      const { active, previewFrameId } = get()
      // Why: a running slide show owns the camera; a preview replaying itself is the normal case.
      if (active && previewFrameId === null) {
        return
      }
      const departure = previewDeparture(
        useDocumentStore.getState().document,
        frameId,
        useCameraStore.getState().viewport
      )
      if (!departure) {
        return
      }
      set({
        active: true,
        index: departure.index,
        overview: false,
        previewFrameId: frameId,
        // Why: replaying must not record the camera mid-preview as the one to come back to.
        cameraBeforeStart:
          previewFrameId === null ? useCameraStore.getState().camera : get().cameraBeforeStart
      })
      // The animator prepares and paints the departure before timing its visible hold.
      flyToFrame(departure.index, {
        departure: {
          camera: departure.camera,
          shot: departure.shot,
          holdMs: previewDepartureHoldMs(departure.departureIndex)
        }
      })
    },
    cancelPreview: () => {
      if (get().previewFrameId === null) {
        return
      }
      // The editor is taking over the camera, so do not start a competing return flight.
      useCameraStore.getState().cancelAnimation()
      clearPresentation()
    },
    flyToCurrent: () => {
      const { active, index, previewFrameId } = get()
      // Why: a preview flies on its own the moment it is asked for; the chrome never moves for it.
      if (active && previewFrameId === null) {
        flyToFrame(index)
      }
    },
    exit: () => {
      const { active, cameraBeforeStart, previewFrameId } = get()
      if (!active) {
        return
      }
      // Clear the shot before returning so the editor never inherits presentation roll or dimming.
      clearPresentation()
      // Why: a preview never went fullscreen, and dropping the window out of it would be a surprise.
      if (previewFrameId === null) {
        void setWindowFullscreen(false)
      }
      if (cameraBeforeStart) {
        useCameraStore.getState().animateTo(cameraBeforeStart, 400)
      }
    },
    next: () => step(1),
    previous: () => step(-1),
    goTo: (index) => {
      const document = useDocumentStore.getState().document
      const count = orderedFrames(document).length
      if (!get().active || index < 0 || index >= count) {
        return
      }
      set({ index, overview: false })
      flyToFrame(index)
    },
    showOverview,
    refitToViewport: () => {
      const { active, overview } = get()
      if (!active) {
        return
      }
      const index = presentedIndex()
      if (index === null) {
        // Why: the previewed frame was deleted while parked, so there is nothing left to hold the
        // roll and the dimming for — let go of the camera rather than refit onto whoever took its place.
        get().cancelPreview()
        return
      }
      // Why: mid-flight (e.g. the macOS fullscreen animation) keep the full transition; once settled,
      // a short correction is enough.
      const camera = useCameraStore.getState()
      const flightMs = motionAt(index)?.motion.ms ?? SETTLE_MS
      const durationMs = camera.isAnimating() ? flightMs : Math.min(250, flightMs)
      if (overview) {
        flyToOverview(durationMs)
      } else {
        flyToFrame(index, { durationMs })
      }
    },
    toggleOverview: () => {
      if (get().overview) {
        get().goTo(get().index)
      } else {
        showOverview()
      }
    }
  }
})

export const selectPresentationActive = (s: PresentationStore) => s.active
/** A full slide show: the only thing the editor chrome steps aside for. */
export const selectSlideShowActive = (s: PresentationStore) => s.active && s.previewFrameId === null
export const selectPreviewing = (s: PresentationStore) => s.active && s.previewFrameId !== null
export const selectPreviewFrameId = (s: PresentationStore) => s.previewFrameId
export const selectPresentationIndex = (s: PresentationStore) => s.index
export const selectPresentationOverview = (s: PresentationStore) => s.active && s.overview
export const selectPresentationRoll = (s: PresentationStore) => (s.active ? s.roll : 0)
export const selectPresentationSpotlight = (s: PresentationStore) =>
  s.active && !s.overview ? s.spotlight : 0
/** What the stage paints right now: level and lit outside a presentation, and in overview. */
export const selectPresentationShot = (s: PresentationStore): Shot => ({
  roll: selectPresentationRoll(s),
  spotlight: selectPresentationSpotlight(s),
  spotlightRect: s.spotlightRect
})
