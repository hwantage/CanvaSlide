import { contentBounds } from '@shared/canvas/element-bounds'
import { startEditingSelection, zoomToSelection } from '@/lib/selection-commands'
import { useCameraStore } from '@/store/camera-store'
import { useContextMenuStore } from '@/store/context-menu-store'
import { useDocumentStore } from '@/store/document-store'
import { useShortcutHelpStore } from '@/store/shortcut-help-store'
import { useToolStore, type ToolId } from '@/store/tool-store'

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
export function handlePlainKeys(event: KeyboardEvent): boolean {
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
  if (key === '?' || (event.shiftKey && event.code === 'Slash')) {
    useShortcutHelpStore.getState().toggle()
    return true
  }
  const digit = shiftedDigit(event)
  if (digit === 1) {
    const bounds = contentBounds(doc.document)
    if (bounds) {
      useCameraStore.getState().fitContent(bounds)
    }
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
