import { useEffect } from 'react'
import { handlePlainKeys } from '@/lib/plain-shortcuts'
import { hasPrimaryModifier, isEditableTarget } from '@/lib/platform-keys'
import { handlePrimaryShortcuts } from '@/lib/primary-shortcuts'
import { closeModalDialogs, isModalDialogOpen } from '@/store/modal-dialogs'
import { usePresentationStore } from '@/store/presentation-store'
import { useToolStore } from '@/store/tool-store'
import type { DocumentCommands } from './use-document-commands'

function handlePresentationKeys(event: KeyboardEvent): boolean {
  const presentation = usePresentationStore.getState()
  if (!presentation.active) {
    return false
  }
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case ' ':
    case 'PageDown':
    case 'Enter':
      presentation.next()
      return true
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
    case 'Backspace':
      presentation.previous()
      return true
    case 'Escape':
      presentation.exit()
      return true
    case 'o':
    case 'O':
      presentation.toggleOverview()
      return true
    default:
      return true
  }
}

export function useKeyboardShortcuts(commands: DocumentCommands): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) && event.key !== 'Escape') {
        return
      }
      // Why: with a modal open, Delete/arrows/tool keys must not reach the canvas behind it.
      if (isModalDialogOpen()) {
        if (event.key === 'Escape') {
          closeModalDialogs()
          event.preventDefault()
        }
        return
      }
      if (handlePresentationKeys(event)) {
        event.preventDefault()
        return
      }
      const handled = hasPrimaryModifier(event)
        ? handlePrimaryShortcuts(event, commands)
        : handlePlainKeys(event)
      if (handled) {
        event.preventDefault()
      }
    }
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
  }, [commands])
}
