import { useEffect } from 'react'
import { contentBounds } from '@shared/canvas/element-bounds'
import { copySelection, cutSelection, requestKeyboardPaste } from '@/lib/object-clipboard'
import { hasPrimaryModifier, isEditableTarget, isMacPlatform } from '@/lib/platform-keys'
import { useCameraStore } from '@/store/camera-store'
import { useDocumentStore } from '@/store/document-store'
import { closeModalDialogs, isModalDialogOpen } from '@/store/modal-dialogs'
import { useExportDialogStore } from '@/store/export-dialog-store'
import { useSettingsDialogStore } from '@/store/settings-dialog-store'
import { usePresentationStore } from '@/store/presentation-store'
import { useToolStore, type ToolId } from '@/store/tool-store'
import type { DocumentCommands } from './use-document-commands'

const toolKeys: Record<string, ToolId> = {
  v: 'select',
  h: 'hand',
  t: 'text',
  r: 'rectangle',
  o: 'ellipse',
  d: 'diamond',
  f: 'frame',
  l: 'connector',
  c: 'connector'
}

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

function handlePrimaryShortcuts(event: KeyboardEvent, commands: DocumentCommands): boolean {
  const doc = useDocumentStore.getState()
  const camera = useCameraStore.getState()
  const key = event.key.toLowerCase()
  // Why: Windows users expect both Ctrl+Y and Ctrl+Shift+Z; macOS only ⇧⌘Z.
  const redoCombo = (key === 'z' && event.shiftKey) || (!isMacPlatform() && key === 'y')
  if (redoCombo) {
    doc.redo()
    return true
  }
  switch (key) {
    case 'z':
      doc.undo()
      return true
    case 'a':
      doc.selectAll()
      return true
    case 'c':
      // Why: the native `copy` event may not fire without a text selection; keep the payload ready.
      copySelection()
      return false
    case 'x':
      cutSelection()
      return true
    case 'v':
      requestKeyboardPaste()
      return false
    case 'd':
      doc.duplicateSelected()
      return true
    case 's':
      void (event.shiftKey ? commands.saveDocumentAs() : commands.saveDocument())
      return true
    case 'o':
      void commands.openDocument()
      return true
    case 'n':
      void commands.newDocument()
      return true
    case 'e':
      useExportDialogStore.getState().show()
      return true
    case ',':
      useSettingsDialogStore.getState().toggle()
      return true
    case 'enter':
      usePresentationStore.getState().start()
      return true
    case '=':
    case '+':
      camera.zoomStep(1)
      return true
    case '-':
      camera.zoomStep(-1)
      return true
    case '0':
      camera.resetZoom()
      return true
    case ']':
      doc.reorderSelected('front')
      return true
    case '[':
      doc.reorderSelected('back')
      return true
    default:
      return false
  }
}

function handlePlainKeys(event: KeyboardEvent): boolean {
  const doc = useDocumentStore.getState()
  const tools = useToolStore.getState()
  const key = event.key
  if (key === 'Escape') {
    tools.setEditingTextId(null)
    doc.clearSelection()
    tools.setTool('select')
    return true
  }
  if (key === 'Delete' || key === 'Backspace') {
    doc.deleteSelected()
    return true
  }
  if (key === ' ') {
    tools.setSpaceHeld(true)
    return true
  }
  if (event.shiftKey && key === '!') {
    const bounds = contentBounds(doc.document)
    if (bounds) {
      useCameraStore.getState().fitContent(bounds)
    }
    return true
  }
  const nudge = key.startsWith('Arrow') ? (event.shiftKey ? 10 : 1) : 0
  if (nudge > 0) {
    const dx = key === 'ArrowLeft' ? -nudge : key === 'ArrowRight' ? nudge : 0
    const dy = key === 'ArrowUp' ? -nudge : key === 'ArrowDown' ? nudge : 0
    doc.translateSelected({ x: dx, y: dy })
    return true
  }
  const tool = toolKeys[key.toLowerCase()]
  if (tool && !event.shiftKey) {
    tools.setTool(tool)
    return true
  }
  return false
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
