import type { PresentationKeyAction } from './presentation-keys'

export type PresentationState = {
  index: number
  count: number
  frameId: string | null
  name: string
  overview: boolean
}

export type PresentationCommand = PresentationKeyAction | 'exit'

export function presentationAvailability(state: PresentationState) {
  return {
    previous: state.count > 0 && (state.overview || state.index > 0),
    next: state.count > 0 && (state.overview || state.index < state.count - 1),
    toggleOverview: state.count > 0
  }
}

export function resolvePresentationCommand(
  action: PresentationCommand,
  state: PresentationState,
  canExit: boolean
): Exclude<PresentationCommand, 'escape'> | null {
  if (action === 'escape') {
    return state.overview ? 'toggleOverview' : canExit ? 'exit' : null
  }
  if (action === 'exit') {
    return canExit ? action : null
  }
  if (action === 'next' || action === 'previous' || action === 'toggleOverview') {
    return presentationAvailability(state)[action] ? action : null
  }
  return action
}
