import { create } from 'zustand'
import { previewDepartureHoldMs } from '@shared/canvas/departure-hold'
import { orderedFrames, stepFrameIndex } from '@shared/canvas/presentation-sequence'
import { useCameraStore } from './camera-store'
import { setWindowFullscreen } from '@/platform/window-fullscreen'
import { useDocumentStore } from './document-store'
import { SETTLE_MS, createPresentationFlights } from './presentation-flight'
import { previewDeparture } from './presentation-shot'
import type { PresentationStore } from './presentation-state'

export type {
  PresentationActions,
  PresentationState,
  PresentationStore
} from './presentation-state'

export const usePresentationStore = create<PresentationStore>()((set, get) => {
  const { motionAt, presentedIndex, flyToFrame, flyToOverview } = createPresentationFlights({
    setState: set,
    getState: get
  })
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
      active: false,
      overview: false,
      cameraBeforeStart: null,
      spotlightRect: null,
      roll: 0,
      spotlight: 0,
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
    active: false,
    index: 0,
    cameraBeforeStart: null,
    overview: false,
    roll: 0,
    spotlight: 0,
    spotlightRect: null,
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
        active: true,
        index,
        overview: false,
        roll: 0,
        spotlight: 0,
        spotlightRect: null,
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
      flyToFrame(
        departure.index,
        undefined,
        previewDepartureHoldMs(departure.departureIndex),
        departure.camera ?? undefined,
        departure.shot
      )
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
        flyToFrame(index, durationMs)
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
export const selectSpotlightRect = (s: PresentationStore) => s.spotlightRect
