import type { DocumentCommands } from '@/hooks/use-document-commands'
import { importPickedFiles } from '@/lib/document/external-content'
import { copySelection, cutSelection, requestKeyboardPaste } from '@/lib/document/object-clipboard'
import { hasPrimaryModifier, isEditableTarget, isMacPlatform } from '@/lib/platform-keys'
import {
  frameSelection,
  presentFromSelection,
  startEditingSelection,
  zoomToContent,
  zoomToSelection
} from '@/lib/document/selection-commands'
import { copySelectedStyle, pasteStyleToSelection } from '@/lib/document/style-clipboard'
import { useCameraStore } from '@/store/camera-store'
import { useContextMenuStore } from '@/store/context-menu-store'
import { useDocumentStore } from '@/store/document-store'
import {
  useExportDialogStore,
  useSettingsDialogStore,
  useShortcutHelpStore
} from '@/store/modal-dialogs'
import { dismissTopModalDialog, isModalDialogOpen } from '@/store/modal-stack'
import { usePresentationStore } from '@/store/presentation-store'
import { useToolStore, type ToolId } from '@/store/tool-store'

export function handleCanvasKeyDown(event: KeyboardEvent, commands: DocumentCommands): void {
  // Some WebViews report the final IME keystroke as 229 after isComposing clears.
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229) {
    return
  }
  // Why: F5 cannot be typed into text, so the slide-show alias stays reachable mid-edit, as in
  // PowerPoint; an open modal still swallows it through the check below.
  if (isEditableTarget(event.target) && event.key !== 'Escape' && event.key !== 'F5') {
    return
  }
  // Why: with a modal open, Delete/arrows/tool keys must not reach the canvas behind it.
  if (isModalDialogOpen()) {
    if (event.key === 'Escape') {
      dismissTopModalDialog()
      event.preventDefault()
    }
    return
  }
  // The shared presentation binder owns slide-show keys; editor shortcuts stay dormant.
  const presentation = usePresentationStore.getState()
  if (presentation.active && presentation.previewFrameId === null) {
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

function handlePresentationKeys(event: KeyboardEvent): boolean {
  const presentation = usePresentationStore.getState()
  if (!presentation.active) {
    return false
  }
  // Modified keys and editing commands stay available while preview navigation owns plain arrows.
  if (presentation.previewFrameId !== null) {
    if (event.key === 'Escape') {
      presentation.exit()
      return true
    }
    if (hasPrimaryModifier(event) || event.altKey || event.shiftKey) {
      return false
    }
    if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(event.key)) {
      presentation.next()
      return true
    }
    if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) {
      presentation.previous()
      return true
    }
    return false
  }
  return false
}

/** Shortcuts that need the primary modifier (⌘ / Ctrl). Returns true when handled. */
function handlePrimaryShortcuts(event: KeyboardEvent, commands: DocumentCommands): boolean {
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
    case 'g':
      doc.groupSelected()
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
  if (key === 'g') {
    doc.ungroupSelected()
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

/** Why: ⇧1 / ⇧2 arrive as "!" / "@" on US layouts but differ elsewhere; accept the digit row too. */
function shiftedDigit(event: KeyboardEvent): number | null {
  if (!event.shiftKey) {
    return null
  }
  if (event.key === '!' || event.code === 'Digit1') {
    return 1
  }
  if (event.key === '@' || event.code === 'Digit2') {
    return 2
  }
  return null
}

/** Unmodified keys (tools, nudges, Enter/F2, view fits). Returns true when handled. */
function handlePlainKeys(event: KeyboardEvent): boolean {
  const doc = useDocumentStore.getState()
  const tools = useToolStore.getState()
  const key = event.key
  if (key === 'Escape') {
    useContextMenuStore.getState().hide()
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
  if (key === 'Enter') {
    return startEditingSelection({ frames: false })
  }
  if (key === 'F2') {
    return startEditingSelection({ frames: true })
  }
  // Why: PowerPoint's F5 / ⇧F5 aliases; ⌘⏎ stays primary because Apple keyboards need fn+F5.
  if (key === 'F5' && !event.altKey && !event.ctrlKey && !event.metaKey) {
    // Leaving the editor commits the typed text as one undo step, the way Escape does.
    tools.setEditingTextId(null)
    if (event.shiftKey) {
      presentFromSelection()
    } else {
      usePresentationStore.getState().start()
    }
    return true
  }
  if (
    key.toLowerCase() === 'k' &&
    !['Alt', 'Control', 'Meta', 'Shift'].some((modifier) => event.getModifierState(modifier))
  ) {
    useShortcutHelpStore.getState().show()
    return true
  }
  const digit = shiftedDigit(event)
  if (digit === 1) {
    zoomToContent()
    return true
  }
  if (digit === 2) {
    zoomToSelection()
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
