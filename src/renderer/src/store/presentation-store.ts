import { create } from 'zustand'
import { elementRect } from '@shared/canvas/element-bounds'
import { camerasEqual } from '@shared/canvas/camera-transform'
import { cameraForOverview, fitRectToViewport } from '@shared/canvas/frame-fit'
import { orderedFrames, stepFrameIndex } from '@shared/canvas/presentation-sequence'
import type { Camera } from '@shared/canvas/element-types'
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
}

export type PresentationActions = {
  start: (fromIndex?: number) => void
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
  const frameTarget = (index: number): Camera | null => {
    const frame = orderedFrames(useDocumentStore.getState().document)[index]
    return frame ? fitRectToViewport(elementRect(frame), useCameraStore.getState().viewport) : null
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
      camera.animateTo(target, SETTLE_MS, () => settle(index))
    }
  }
  const flyToFrame = (index: number, durationMs: number) => {
    const target = frameTarget(index)
    if (target) {
      useCameraStore.getState().animateTo(target, durationMs, () => settle(index))
    }
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
    flyToFrame(nextIndex, document.settings.transitionMs)
  }
  const flyToOverview = (durationMs: number) => {
    const camera = useCameraStore.getState()
    const target = cameraForOverview(useDocumentStore.getState().document, camera.viewport)
    if (!target) {
      return false
    }
    camera.animateTo(target, durationMs)
    return true
  }
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
        cameraBeforeStart: useCameraStore.getState().camera
      })
      // Why: once the OS reports fullscreen, refit against the final viewport whatever events
      // arrived (or not) during the transition.
      void setWindowFullscreen(true).then(() => get().refitToViewport())
    },
    flyToCurrent: () => {
      const { active, index } = get()
      if (active) {
        flyToFrame(index, useDocumentStore.getState().document.settings.transitionMs)
      }
    },
    exit: () => {
      const { active, cameraBeforeStart } = get()
      if (!active) {
        return
      }
      set({ active: false, overview: false, cameraBeforeStart: null })
      void setWindowFullscreen(false)
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
      flyToFrame(index, document.settings.transitionMs)
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
      const { transitionMs } = useDocumentStore.getState().document.settings
      const durationMs = camera.isAnimating() ? transitionMs : Math.min(250, transitionMs)
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
export const selectPresentationIndex = (s: PresentationStore) => s.index
export const selectPresentationOverview = (s: PresentationStore) => s.active && s.overview
