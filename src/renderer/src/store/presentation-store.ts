import { create } from 'zustand'
import { previewDepartureHoldMs } from '@shared/canvas/departure-hold'
import { selectedFrameIds, stepSelectedFrame } from '@shared/canvas/frame-selection'
import { frameIndexById, orderedFrames } from '@shared/canvas/presentation-sequence'
import type { Camera, ElementId, Rect } from '@shared/canvas/element-types'
import { LEVEL_SHOT, previewDeparture, type Shot } from '@shared/canvas/presentation-shot'
import { createPresentationNavigator } from '@shared/presentation/presentation-navigator'
import { useCameraStore } from './camera-store'
import { setWindowFullscreen } from '@/platform/window-fullscreen'
import { useDocumentStore } from './document-store'
import { useToolStore } from './tool-store'

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
  /** Membership stays fixed while the editable deck may change its order. */
  previewFrameIds: ElementId[]
}

export type PresentationActions = {
  start: (fromIndex?: number) => void
  /** Show the preceding frame before flying in; the opening frame needs no departure hold. */
  previewTransition: (frameId: ElementId, frameIds?: readonly ElementId[]) => void
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
  const deck = () => orderedFrames(useDocumentStore.getState().document)
  // Resolve previews by id because the editable deck may reorder or delete the target frame.
  const presentedIndex = (): number | null => {
    const { active, index, previewFrameId } = get()
    if (!active) {
      return null
    }
    if (previewFrameId === null) {
      return index
    }
    const found = frameIndexById(deck(), previewFrameId)
    if (found === -1) {
      return null
    }
    if (found !== index) {
      set({ index: found })
    }
    return found
  }
  const navigation = createPresentationNavigator({
    getDocument: () => useDocumentStore.getState().document,
    getViewport: () => useCameraStore.getState().viewport,
    getCamera: () => useCameraStore.getState().camera,
    isAnimating: () => useCameraStore.getState().isAnimating(),
    animateTo: (target, durationMs, options) =>
      useCameraStore.getState().animateTo(target, durationMs, options),
    getShot: () => get(),
    setShot: (shot) => set(shot),
    getPosition: () => get(),
    setPosition: ({ index, overview }) => {
      const { previewFrameId } = get()
      // A preview follows the frame it lands on, so replays survive the deck being reordered.
      set(
        previewFrameId === null
          ? { index, overview }
          : { index, overview, previewFrameId: deck()[index]?.id ?? previewFrameId }
      )
    },
    presentedIndex
  })

  const step = (direction: 1 | -1) => {
    const { active, previewFrameId, previewFrameIds } = get()
    if (!active) {
      return
    }
    if (previewFrameId === null) {
      navigation.step(direction)
      return
    }
    const ids = selectedFrameIds(useDocumentStore.getState().document, previewFrameIds)
    if (!ids.includes(previewFrameId)) {
      get().cancelPreview()
      return
    }
    const nextId = stepSelectedFrame(ids, previewFrameId, direction)
    if (nextId) {
      navigation.goTo(frameIndexById(deck(), nextId))
    }
  }
  /** The level, lit, inactive state both ways out of presenting land on. */
  const clearPresentation = () =>
    set({
      ...LEVEL_SHOT,
      active: false,
      overview: false,
      cameraBeforeStart: null,
      previewFrameId: null,
      previewFrameIds: []
    })
  /** Overview and its toggle belong to slide shows; a preview stays on its selected frames. */
  const ownsOverview = () => get().active && get().previewFrameId === null

  return {
    ...LEVEL_SHOT,
    active: false,
    index: 0,
    cameraBeforeStart: null,
    overview: false,
    previewFrameId: null,
    previewFrameIds: [],
    start: (fromIndex = 0) => {
      // A start request commits typing even without frames, matching F5's existing behavior.
      useToolStore.getState().setEditingTextId(null)
      const documentStore = useDocumentStore.getState()
      if (deck().length === 0) {
        return
      }
      documentStore.clearSelection()
      // Why: a preview still resting on its departure would otherwise take off under the slide show.
      useCameraStore.getState().cancelAnimation()
      set({
        ...LEVEL_SHOT,
        active: true,
        previewFrameId: null,
        previewFrameIds: [],
        cameraBeforeStart: useCameraStore.getState().camera
      })
      // The viewport flies once it has re-measured without the editor chrome (flyToCurrent).
      navigation.start(fromIndex)
      // Refit after the OS finishes fullscreen, even if it skipped intermediate resize events.
      void setWindowFullscreen(true).then(() => get().refitToViewport())
    },
    previewTransition: (frameId, frameIds = [frameId]) => {
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
      useToolStore.getState().setEditingTextId(null)
      set({
        active: true,
        index: departure.index,
        overview: false,
        previewFrameId: frameId,
        previewFrameIds: selectedFrameIds(useDocumentStore.getState().document, [
          ...frameIds,
          frameId
        ]),
        // Why: replaying must not record the camera mid-preview as the one to come back to.
        cameraBeforeStart:
          previewFrameId === null ? useCameraStore.getState().camera : get().cameraBeforeStart
      })
      // The animator prepares and paints the departure before timing its visible hold.
      navigation.flyTo(departure.index, {
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
      const { active, previewFrameId } = get()
      // Why: a preview flies on its own the moment it is asked for; the chrome never moves for it.
      if (active && previewFrameId === null) {
        navigation.flyToCurrent()
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
      const frame = deck()[index]
      const { active, previewFrameId, previewFrameIds } = get()
      if (!active || !frame) {
        return
      }
      if (previewFrameId !== null && !previewFrameIds.includes(frame.id)) {
        return
      }
      navigation.goTo(index)
    },
    showOverview: () => {
      if (ownsOverview()) {
        navigation.showOverview()
      }
    },
    refitToViewport: () => {
      if (!get().active) {
        return
      }
      if (presentedIndex() === null) {
        // Why: the previewed frame was deleted while parked, so there is nothing left to hold the
        // roll and the dimming for — let go of the camera rather than refit onto whoever took its place.
        get().cancelPreview()
        return
      }
      navigation.refit()
    },
    toggleOverview: () => {
      if (ownsOverview()) {
        navigation.toggleOverview()
      }
    }
  }
})

export const selectPresentationActive = (s: PresentationStore) => s.active
/** A full slide show: the only thing the editor chrome steps aside for. */
export const selectSlideShowActive = (s: PresentationStore) => s.active && s.previewFrameId === null
export const selectPreviewing = (s: PresentationStore) => s.active && s.previewFrameId !== null
export const selectPreviewFrameId = (s: PresentationStore) => s.previewFrameId
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
