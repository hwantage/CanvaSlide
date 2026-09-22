import { create } from 'zustand'
import { usePresentationStore } from './presentation-store'

export type PresentationAnnotationState = {
  /** The laser is out: a dot follows the cursor, and a drag leaves ink where it went. */
  pointing: boolean
  /**
   * Bumped to wipe the ink layer. The strokes themselves never live here: they are DOM nodes the
   * ink overlay owns, so a drawn point costs no store update and no React render.
   */
  clearCount: number
}

export type PresentationAnnotationActions = {
  togglePointer: () => void
  clearInk: () => void
  reset: () => void
}

export type PresentationAnnotationStore = PresentationAnnotationState &
  PresentationAnnotationActions

export const usePresentationAnnotationStore = create<PresentationAnnotationStore>()((set, get) => ({
  pointing: false,
  clearCount: 0,
  togglePointer: () => set({ pointing: !get().pointing }),
  // Why: monotonic, so a wipe is one comparison for the overlay and never replays on reset.
  clearInk: () => set({ clearCount: get().clearCount + 1 }),
  reset: () => set({ pointing: false })
}))

// Nothing the presenter armed may outlive the show; the next one starts with a bare cursor.
usePresentationStore.subscribe((state, previous) => {
  if (previous.active && !state.active) {
    usePresentationAnnotationStore.getState().reset()
  }
})

export const selectPointing = (s: PresentationAnnotationStore) => s.pointing
/** The laser replaces the arrow outright, so there is one mark on screen rather than two. */
export const selectAnnotationCursor = (s: PresentationAnnotationStore) =>
  s.pointing ? 'none' : 'default'
