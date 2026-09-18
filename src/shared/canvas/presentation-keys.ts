/** What a key does inside a running slide show; the editor and the export player agree on it. */
export type PresentationKeyAction = 'next' | 'previous' | 'toggleOverview' | 'escape'

export function presentationKeyAction(key: string): PresentationKeyAction | null {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case ' ':
    case 'PageDown':
    case 'Enter':
      return 'next'
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
    case 'Backspace':
      return 'previous'
    case 'o':
    case 'O':
      return 'toggleOverview'
    case 'Escape':
      return 'escape'
    default:
      return null
  }
}
