import type { DocumentCommands } from '@/hooks/use-document-commands'
import { importPickedFiles } from '@/lib/external-content'
import { copySelection, cutSelection, requestKeyboardPaste } from '@/lib/object-clipboard'
import { isMacPlatform } from '@/lib/platform-keys'
import { frameSelection, presentFromSelection } from '@/lib/selection-commands'
import { copySelectedStyle, pasteStyleToSelection } from '@/lib/style-clipboard'
import { useCameraStore } from '@/store/camera-store'
import { useDocumentStore } from '@/store/document-store'
import { useExportDialogStore } from '@/store/export-dialog-store'
import { usePresentationStore } from '@/store/presentation-store'
import { useSettingsDialogStore } from '@/store/settings-dialog-store'

/** Shortcuts that need the primary modifier (⌘ / Ctrl). Returns true when handled. */
export function handlePrimaryShortcuts(event: KeyboardEvent, commands: DocumentCommands): boolean {
  const doc = useDocumentStore.getState()
  const camera = useCameraStore.getState()
  const key = event.key.toLowerCase()
  // Why: macOS folds ⌥ into the key (⌥C → "ç"), so style shortcuts match on the physical key.
  if (event.altKey) {
    if (event.code === 'KeyC') {
      copySelectedStyle()
      return true
    }
    if (event.code === 'KeyV') {
      pasteStyleToSelection()
      return true
    }
    return false
  }
  // Why: Windows users expect both Ctrl+Y and Ctrl+Shift+Z; macOS only ⇧⌘Z.
  const redoCombo = (key === 'z' && event.shiftKey) || (!isMacPlatform() && key === 'y')
  if (redoCombo) {
    doc.redo()
    return true
  }
  if (event.shiftKey && handleShiftedShortcuts(event, commands)) {
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
      void commands.saveDocument()
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
    case 'i':
      void importPickedFiles()
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
      doc.reorderSelected('forward')
      return true
    case '[':
      doc.reorderSelected('backward')
      return true
    default:
      return false
  }
}

/** ⇧ + primary. Why: US layouts report ⇧] as "}", so brackets are matched by physical key too. */
function handleShiftedShortcuts(event: KeyboardEvent, commands: DocumentCommands): boolean {
  const doc = useDocumentStore.getState()
  const key = event.key.toLowerCase()
  if (key === 's') {
    void commands.saveDocumentAs()
    return true
  }
  if (key === 'f') {
    frameSelection()
    return true
  }
  if (key === 'enter') {
    presentFromSelection()
    return true
  }
  if (key === ']' || key === '}' || event.code === 'BracketRight') {
    doc.reorderSelected('front')
    return true
  }
  if (key === '[' || key === '{' || event.code === 'BracketLeft') {
    doc.reorderSelected('back')
    return true
  }
  return false
}
