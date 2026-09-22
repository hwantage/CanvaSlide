/**
 * What a key does inside a running slide show; the editor and the export player agree on it.
 * Renderers ignore the actions they do not implement, so this union can grow without breaking them.
 */
export type PresentationKeyAction =
  | 'next'
  | 'previous'
  | 'toggleOverview'
  | 'escape'
  | 'togglePointer'
  | 'clearInk'

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
    // Why: pointing and drawing are one tool, and PowerPoint's pen key is the one that covers both.
    case 'p':
    case 'P':
      return 'togglePointer'
    case 'e':
    case 'E':
      return 'clearInk'
    case 'Escape':
      return 'escape'
    default:
      return null
  }
}
