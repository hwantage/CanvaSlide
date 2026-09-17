import { create } from 'zustand'
import { elementRect, interpolateRect } from '@shared/canvas/element-bounds'
import { camerasEqual } from '@shared/canvas/camera-transform'
import { cameraForOverview, fitRectToViewport } from '@shared/canvas/frame-fit'
import { frameIndexById, orderedFrames, stepFrameIndex } from '@shared/canvas/presentation-sequence'
import { resolveFrameTransition } from '@shared/canvas/frame-transition'
import type { Camera, ElementId, Rect } from '@shared/canvas/element-types'
import { useCameraStore } from './camera-store'
import { setWindowFullscreen } from '@/platform/window-fullscreen'
import { useDocumentStore } from './document-store'

/** Correction hop after a flight lands on a viewport that changed underneath it. */
const SETTLE_MS = 250

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
  /** Frame the preview flies into; null during an ordinary slide show. Held by id, since the deck
   * can be reordered from the list while the preview is parked. */
  previewFrameId: ElementId | null
}

export type PresentationActions = {
  start: (fromIndex?: number) => void
  /** Plays the flight into a frame from the one before it; call again to replay it. */
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

export const usePresentationStore = create<PresentationStore>()((set, get) => {
  const motionAt = (index: number) => {
    const document = useDocumentStore.getState().document
    const frame = orderedFrames(document)[index]
    return frame ? { frame, motion: resolveFrameTransition(frame, document.settings) } : null
  }
  const frameTarget = (index: number): Camera | null => {
    const at = motionAt(index)
    return at
      ? fitRectToViewport(
          elementRect(at.frame),
          useCameraStore.getState().viewport,
          undefined,
          at.motion.roll
        )
      : null
  }
  /**
   * Lerps the whole shot — roll, dimming and the cut-out — on the camera's own eased clock, so it
   * lands with the move. The rect travels too: handing the hole to the target frame up front makes
   * a lit frame black out the instant the flight starts.
   */
  const shotProgress = (to: { roll: number; spotlight: number; rect?: Rect }) => {
    const { roll: fromRoll, spotlight: fromSpotlight, spotlightRect } = get()
    const fromRect = spotlightRect ?? to.rect ?? null
    const toRect = to.rect ?? fromRect
    if (fromRoll === to.roll && fromSpotlight === to.spotlight && fromRect === toRect) {
      return undefined
    }
    return (t: number) =>
      set({
        roll: fromRoll + (to.roll - fromRoll) * t,
        spotlight: fromSpotlight + (to.spotlight - fromSpotlight) * t,
        spotlightRect:
          fromRect && toRect ? interpolateRect(fromRect, toRect, t) : (toRect ?? fromRect)
      })
  }
  /**
   * Why: the viewport can change while a flight is in the air (macOS fullscreen finishes on its
   * own schedule, and not every engine reports the final size before the flight ends). When the
   * flight lands, compare against the viewport as it is now and correct with a short hop.
   */
  const settle = (index: number) => {
    const { active, overview } = get()
    if (!active || overview || get().index !== index) {
      return
    }
    const target = frameTarget(index)
    const camera = useCameraStore.getState()
    if (target && !camerasEqual(camera.camera, target, 0.5)) {
      camera.animateTo(target, SETTLE_MS, { onDone: () => settle(index) })
    }
  }
  /** `durationMs` overrides the frame's own timing; correction hops pass one, normal steps do not. */
  const flyToFrame = (index: number, durationMs?: number) => {
    const at = motionAt(index)
    const target = frameTarget(index)
    if (!at || !target) {
      return
    }
    const { motion, frame } = at
    const onProgress = shotProgress({
      roll: motion.roll,
      spotlight: motion.spotlight,
      rect: elementRect(frame)
    })
    useCameraStore.getState().animateTo(target, durationMs ?? motion.ms, {
      rho: motion.arc,
      easing: motion.easing,
      onProgress,
      onDone: () => settle(index)
    })
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
  const flyToOverview = (durationMs: number) => {
    const camera = useCameraStore.getState()
    const target = cameraForOverview(useDocumentStore.getState().document, camera.viewport)
    if (!target) {
      return false
    }
    // Why: the overview is a plain top-down look at the board, so any roll or dimming unwinds.
    // Why: the overview is level and lit, and the hole fades where it stands rather than flying off.
    camera.animateTo(target, durationMs, { onProgress: shotProgress({ roll: 0, spotlight: 0 }) })
    return true
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
      // Why: once the OS reports fullscreen, refit against the final viewport whatever events
      // arrived (or not) during the transition.
      void setWindowFullscreen(true).then(() => get().refitToViewport())
    },
    previewTransition: (frameId) => {
      const { active, previewFrameId } = get()
      const frames = orderedFrames(useDocumentStore.getState().document)
      const index = frameIndexById(frames, frameId)
      // Why: a running slide show owns the camera; a preview replaying itself is the normal case.
      if ((active && previewFrameId === null) || index === -1) {
        return
      }
      // Why: the opening frame has no incoming flight, so its preview starts wherever the editor is.
      const departureIndex = index > 0 ? index - 1 : null
      const departure = departureIndex === null ? null : motionAt(departureIndex)
      set({
        active: true,
        index: departureIndex ?? index,
        overview: false,
        roll: departure?.motion.roll ?? 0,
        spotlight: departure?.motion.spotlight ?? 0,
        spotlightRect: departure ? elementRect(departure.frame) : null,
        previewFrameId: frameId,
        // Why: replaying must not record the camera mid-preview as the one to come back to.
        cameraBeforeStart:
          previewFrameId === null ? useCameraStore.getState().camera : get().cameraBeforeStart
      })
      const departurePoint = departureIndex === null ? null : frameTarget(departureIndex)
      if (departurePoint) {
        useCameraStore.getState().setCamera(departurePoint)
      }
      set({ index })
      flyToFrame(index)
    },
    cancelPreview: () => {
      if (get().previewFrameId === null) {
        return
      }
      // Why: no flight home — the caller is taking the camera somewhere itself, and two flights
      // fighting over it is exactly what looked broken.
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
      // Why: leaving drops the shot at once — a tilted, dimmed editor during the exit flight would
      // be worse than a clean cut, and the selectors report level and lit the moment `active` is off.
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
      const { active, overview, index } = get()
      if (!active) {
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
