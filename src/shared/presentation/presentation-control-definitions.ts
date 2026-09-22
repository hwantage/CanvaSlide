import type { PresentationCommand } from '../canvas/presentation-controls'

export type ControlId = Exclude<PresentationCommand, 'escape'> | 'tools'
export type PresentationLabels = Record<ControlId, string> & { controls: string }

const chevron = (direction: 'left' | 'right') =>
  `<path d="${direction === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'}"/>`

export const PRESENTATION_CONTROLS: readonly { id: ControlId; icon: string; testId?: string }[] = [
  {
    id: 'toggleOverview',
    icon: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>'
  },
  { id: 'previous', icon: chevron('left') },
  { id: 'next', icon: chevron('right') },
  {
    id: 'togglePointer',
    testId: 'pointer-toggle',
    icon: '<path d="m16 3 5 5-12 12H4v-5L16 3Z"/><path d="m14 5 5 5"/>'
  },
  {
    id: 'clearInk',
    testId: 'ink-clear',
    icon: '<path d="m18 3 3 3a2 2 0 0 1 0 3L9 21H6l-4-4a2 2 0 0 1 0-3L15 3a2 2 0 0 1 3 0Z"/><path d="m8 9 7 7M9 21h12"/>'
  },
  {
    id: 'tools',
    testId: 'presentation-tools',
    icon: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
  },
  { id: 'exit', icon: '<path d="m18 6-12 12M6 6l12 12"/>' }
]

export function controlIcon(geometry: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${geometry}</svg>`
}
