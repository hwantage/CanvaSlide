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
