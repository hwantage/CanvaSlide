export type AnnotationState = {
  pointing: boolean
  clearCount: number
  frameId: string | null
}

/** Session state only: pointer samples and document data never pass through this store. */
export function createAnnotationSession() {
  let state: AnnotationState = { pointing: false, clearCount: 0, frameId: null }
  const listeners = new Set<(state: AnnotationState, previous: AnnotationState) => void>()
  const update = (patch: Partial<AnnotationState>) => {
    const previous = state
    state = { ...state, ...patch }
    for (const listener of listeners) {
      listener(state, previous)
    }
  }
  return {
    getState: () => state,
    subscribe: (listener: (state: AnnotationState, previous: AnnotationState) => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    togglePointer: () => update({ pointing: !state.pointing }),
    clearInk: () => update({ clearCount: state.clearCount + 1 }),
    setFrame: (frameId: string | null) => {
      if (frameId !== state.frameId) {
        update({ frameId, clearCount: state.clearCount + 1 })
      }
    },
    reset: () => update({ pointing: false, frameId: null, clearCount: state.clearCount + 1 })
  }
}

export type AnnotationSession = ReturnType<typeof createAnnotationSession>
