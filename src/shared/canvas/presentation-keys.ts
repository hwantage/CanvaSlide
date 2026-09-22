/**
 * What a key does inside a running slide show; the editor and the export player agree on it.
 * The shared presentation controller resolves supported commands for both hosts.
 */
export type PresentationKeyAction =
  | 'next'
  | 'previous'
  | 'toggleOverview'
  | 'escape'
  | 'togglePointer'
  | 'clearInk'

function letterCodeAction(code: string): PresentationKeyAction | null {
  switch (code) {
    case 'KeyP':
      return 'togglePointer'
    case 'KeyE':
      return 'clearInk'
    case 'KeyO':
      return 'toggleOverview'
    default:
      return null
  }
}

export function presentationKeyAction(
  key: string,
  { code = '', composing = false }: { code?: string; composing?: boolean } = {}
): PresentationKeyAction | null {
  // IMEs can report Process/229 even on the non-editable presentation surface.
  if (composing) {
    return letterCodeAction(code)
  }
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
      return letterCodeAction(code)
  }
}
