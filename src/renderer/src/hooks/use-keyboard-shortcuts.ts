import { useEffect } from 'react'
import type { ObjectClipboard } from '@/lib/document/object-clipboard'
import { handleCanvasKeyDown } from '@/lib/interaction/keyboard-shortcuts'
import { useToolStore } from '@/store/tool-store'
import type { DocumentCommands } from './use-document-commands'

export function useKeyboardShortcuts(commands: DocumentCommands, clipboard: ObjectClipboard): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => handleCanvasKeyDown(event, { commands, clipboard })
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === ' ') {
        useToolStore.getState().setSpaceHeld(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [commands, clipboard])
}
