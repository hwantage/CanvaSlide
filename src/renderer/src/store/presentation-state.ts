import type { Camera, ElementId, Rect } from '@shared/canvas/element-types'

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
