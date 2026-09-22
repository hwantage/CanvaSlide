import type { Camera, Size } from '../canvas/element-types'
import type { PresentationState } from '../canvas/presentation-controls'

export type PresentationView = { camera: Camera; viewport: Size; roll: number }
export type PresentationHost = {
  getState: () => PresentationState
  getView: () => PresentationView
  subscribeState: (listener: () => void) => () => void
  subscribeView: (listener: () => void) => () => void
  next: () => void
  previous: () => void
  toggleOverview: () => void
  exit?: (() => void) | undefined
  isInputBlocked?: () => boolean
}
