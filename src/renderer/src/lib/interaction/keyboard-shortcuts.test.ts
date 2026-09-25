import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { DocumentCommands } from '@/hooks/use-document-commands'
import { importPickedFiles, pasteFromSystemClipboard } from '@/lib/document/external-content'
import type { KeyboardPasteFallback, ObjectClipboard } from '@/lib/document/object-clipboard'
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
import { pushModalDialog } from '@/store/modal-stack'
import { usePresentationStore } from '@/store/presentation-store'
import { useToolStore } from '@/store/tool-store'
import { handleCanvasKeyDown } from './keyboard-shortcuts'

vi.mock('@/lib/document/external-content', () => ({
  importPickedFiles: vi.fn(async () => undefined),
  pasteFromSystemClipboard: vi.fn(async () => undefined)
}))
vi.mock('@/lib/document/selection-commands', () => ({
  frameSelection: vi.fn(),
  presentFromSelection: vi.fn(),
  startEditingSelection: vi.fn(() => true),
  zoomToContent: vi.fn(),
  zoomToSelection: vi.fn()
}))
vi.mock('@/lib/document/style-clipboard', () => ({
  copySelectedStyle: vi.fn(),
  pasteStyleToSelection: vi.fn()
}))

const stores = [
  useDocumentStore,
  useCameraStore,
  useToolStore,
  useContextMenuStore,
  usePresentationStore,
  useExportDialogStore,
  useSettingsDialogStore,
  useShortcutHelpStore
] as const
const initial = stores.map((store) => store.getState())

type Stub = Mock<(...args: unknown[]) => void>
const stub = (): Stub => vi.fn<(...args: unknown[]) => void>()

let doc: {
  undo: Stub
  redo: Stub
  selectAll: Stub
  duplicateSelected: Stub
  groupSelected: Stub
  ungroupSelected: Stub
  reorderSelected: Stub
  deleteSelected: Stub
  clearSelection: Stub
  translateSelected: Stub
}
let camera: { zoomStep: Stub; resetZoom: Stub }
let tools: {
  setTool: Stub
  setEditingTextId: Stub
  setSpaceHeld: Stub
}
let presentation: {
  start: Stub
  next: Stub
  previous: Stub
  exit: Stub
}
let hideMenu: Stub
let commands: DocumentCommands
let clipboard: ObjectClipboard

function useMac(mac: boolean): void {
  vi.stubGlobal('navigator', { userAgent: mac ? 'Macintosh' : 'Windows NT 10.0' })
}

type Press = KeyboardEventInit & { primary?: boolean; target?: HTMLElement; keyCode?: number }

/** Dispatches one keydown and reports whether the dispatcher claimed it. */
function press(key: string, { primary, target, keyCode, ...init }: Press = {}): boolean {
  const mac = /Mac/.test(navigator.userAgent)
  const event = new KeyboardEvent('keydown', {
    key,
    cancelable: true,
    bubbles: true,
    metaKey: primary === true && mac,
    ctrlKey: primary === true && !mac,
    ...init
  })
  if (keyCode !== undefined) {
    Object.defineProperty(event, 'keyCode', { value: keyCode })
  }
  const context = { commands, clipboard }
  if (target) {
    const listener = (dispatched: Event) =>
      handleCanvasKeyDown(dispatched as KeyboardEvent, context)
    target.addEventListener('keydown', listener)
    target.dispatchEvent(event)
    target.removeEventListener('keydown', listener)
  } else {
    handleCanvasKeyDown(event, context)
  }
  return event.defaultPrevented
}

beforeEach(() => {
  useMac(true)
  doc = {
    undo: stub(),
    redo: stub(),
    selectAll: stub(),
    duplicateSelected: stub(),
    groupSelected: stub(),
    ungroupSelected: stub(),
    reorderSelected: stub(),
    deleteSelected: stub(),
    clearSelection: stub(),
    translateSelected: stub()
  }
  useDocumentStore.setState(doc)
  camera = { zoomStep: stub(), resetZoom: stub() }
  useCameraStore.setState(camera)
  tools = { setTool: stub(), setEditingTextId: stub(), setSpaceHeld: stub() }
  useToolStore.setState(tools)
  presentation = { start: stub(), next: stub(), previous: stub(), exit: stub() }
  usePresentationStore.setState({ ...presentation, active: false, previewFrameId: null })
  hideMenu = stub()
  useContextMenuStore.setState({ hide: hideMenu })
  commands = {
    newDocument: vi.fn(async () => undefined),
    openDocument: vi.fn(async () => undefined),
    openDocumentPath: vi.fn(async () => undefined),
    saveDocument: vi.fn(async () => undefined),
    saveDocumentAs: vi.fn(async () => undefined)
  }
  clipboard = {
    copySelection: vi.fn(() => null),
    cutSelection: vi.fn(() => null),
    objectPasteTarget: vi.fn(() => null),
    pasteObjects: vi.fn(),
    memoryPayload: vi.fn(() => null),
    nativePasteArrived: vi.fn(),
    requestKeyboardPaste: vi.fn()
  }
})

afterEach(() => {
  stores.forEach((store, index) =>
    (store.setState as (state: unknown, replace: true) => void)(initial[index], true)
  )
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('keys the canvas must not take', () => {
  it('ignores handled, composing and IME-final keystrokes', () => {
    const handled = new KeyboardEvent('keydown', { key: 'Delete', cancelable: true })
    handled.preventDefault()
    handleCanvasKeyDown(handled, { commands, clipboard })
    expect(press('Delete', { isComposing: true })).toBe(false)
    expect(press('Delete', { keyCode: 229 })).toBe(false)
    expect(doc.deleteSelected).not.toHaveBeenCalled()
  })

  it('leaves typing to text fields but keeps Escape and F5', () => {
    const input = document.createElement('input')
    document.body.append(input)
    expect(press('Delete', { target: input })).toBe(false)
    expect(press('z', { primary: true, target: input })).toBe(false)
    expect(doc.deleteSelected).not.toHaveBeenCalled()
    expect(doc.undo).not.toHaveBeenCalled()
    expect(press('F5', { target: input })).toBe(true)
    expect(presentation.start).toHaveBeenCalledOnce()
    expect(press('Escape', { target: input })).toBe(true)
    expect(doc.clearSelection).toHaveBeenCalledOnce()
    input.remove()
  })

  it('sends Escape to the top modal dialog and swallows everything else', () => {
    const lower = vi.fn()
    const upper = vi.fn()
    const closeLower = pushModalDialog({ dismiss: lower })
    const closeUpper = pushModalDialog({ dismiss: upper })
    try {
      expect(press('Delete')).toBe(false)
      expect(press('z', { primary: true })).toBe(false)
      expect(press('F5')).toBe(false)
      expect(doc.deleteSelected).not.toHaveBeenCalled()
      expect(doc.undo).not.toHaveBeenCalled()
      expect(presentation.start).not.toHaveBeenCalled()
      expect(press('Escape')).toBe(true)
      expect(upper).toHaveBeenCalledOnce()
      expect(lower).not.toHaveBeenCalled()
      expect(doc.clearSelection).not.toHaveBeenCalled()
    } finally {
      closeUpper()
      closeLower()
    }
  })

  it('stays dormant during a slide show, which binds its own keys', () => {
    usePresentationStore.setState({ active: true, previewFrameId: null })
    for (const key of ['Escape', 'ArrowRight', 'Delete', 'F5']) {
      expect(press(key)).toBe(false)
    }
    expect(press('z', { primary: true })).toBe(false)
    expect(presentation.next).not.toHaveBeenCalled()
    expect(presentation.exit).not.toHaveBeenCalled()
    expect(doc.undo).not.toHaveBeenCalled()
  })
})

describe('frame preview navigation', () => {
  beforeEach(() => usePresentationStore.setState({ active: true, previewFrameId: 'f1' }))

  it.each([
    ['ArrowRight', 'ArrowRight'],
    ['ArrowDown', 'ArrowDown'],
    ['Space', ' '],
    ['PageDown', 'PageDown']
  ])('%s moves to the next frame', (_label, key) => {
    expect(press(key)).toBe(true)
    expect(presentation.next).toHaveBeenCalledOnce()
    expect(tools.setSpaceHeld).not.toHaveBeenCalled()
  })

  it.each(['ArrowLeft', 'ArrowUp', 'PageUp'])('%s moves to the previous frame', (key) => {
    expect(press(key)).toBe(true)
    expect(presentation.previous).toHaveBeenCalledOnce()
    expect(doc.translateSelected).not.toHaveBeenCalled()
  })

  it('never navigates with ⌘ or ⌥ held', () => {
    expect(press('ArrowRight', { primary: true })).toBe(false)
    expect(press('ArrowRight', { altKey: true })).toBe(true)
    expect(presentation.next).not.toHaveBeenCalled()
    expect(doc.translateSelected).toHaveBeenCalledWith({ x: 1, y: 0 })
  })

  it('exits on Escape and leaves modified keys to the editor', () => {
    expect(press('ArrowRight', { shiftKey: true })).toBe(true)
    expect(presentation.next).not.toHaveBeenCalled()
    expect(doc.translateSelected).toHaveBeenCalledWith({ x: 10, y: 0 })
    expect(press('z', { primary: true })).toBe(true)
    expect(doc.undo).toHaveBeenCalledOnce()
    expect(press('Escape')).toBe(true)
    expect(presentation.exit).toHaveBeenCalledOnce()
    expect(doc.clearSelection).not.toHaveBeenCalled()
  })
})

describe('primary-modifier shortcuts', () => {
  it.each([
    ['⌘Z', 'z', false, () => doc.undo],
    ['⇧⌘Z', 'z', true, () => doc.redo],
    ['⌘A', 'a', false, () => doc.selectAll],
    ['⌘D', 'd', false, () => doc.duplicateSelected],
    ['⌘G', 'g', false, () => doc.groupSelected],
    ['⇧⌘G', 'g', true, () => doc.ungroupSelected],
    ['⌘S', 's', false, () => commands.saveDocument],
    ['⇧⌘S', 's', true, () => commands.saveDocumentAs],
    ['⌘O', 'o', false, () => commands.openDocument],
    ['⌘N', 'n', false, () => commands.newDocument],
    ['⌘I', 'i', false, () => importPickedFiles],
    ['⇧⌘F', 'f', true, () => frameSelection],
    ['⌘Enter', 'Enter', false, () => presentation.start],
    ['⇧⌘Enter', 'Enter', true, () => presentFromSelection],
    ['⌘X', 'x', false, () => clipboard.cutSelection]
  ] as const)('%s runs its command', (_label, key, shiftKey, action) => {
    expect(press(key, { primary: true, shiftKey })).toBe(true)
    expect(action()).toHaveBeenCalledOnce()
  })

  it('opens the export dialog and toggles settings', () => {
    expect(press('e', { primary: true })).toBe(true)
    expect(useExportDialogStore.getState().open).toBe(true)
    expect(press(',', { primary: true })).toBe(true)
    expect(useSettingsDialogStore.getState().open).toBe(true)
    press(',', { primary: true })
    expect(useSettingsDialogStore.getState().open).toBe(false)
  })

  it('zooms with = + - and 0', () => {
    expect(press('=', { primary: true })).toBe(true)
    expect(press('+', { primary: true })).toBe(true)
    expect(press('-', { primary: true })).toBe(true)
    expect(camera.zoomStep.mock.calls).toEqual([[1], [1], [-1]])
    expect(press('0', { primary: true })).toBe(true)
    expect(camera.resetZoom).toHaveBeenCalledOnce()
  })

  it('reorders by bracket, matching shifted brackets by physical key on any layout', () => {
    press(']', { primary: true })
    press('[', { primary: true })
    press('}', { primary: true, shiftKey: true })
    press('{', { primary: true, shiftKey: true })
    press('ü', { primary: true, shiftKey: true, code: 'BracketRight' })
    press('ö', { primary: true, shiftKey: true, code: 'BracketLeft' })
    expect(doc.reorderSelected.mock.calls).toEqual([
      ['forward'],
      ['backward'],
      ['front'],
      ['back'],
      ['front'],
      ['back']
    ])
  })

  it('copies without claiming the key so the native copy event still fires', () => {
    expect(press('c', { primary: true })).toBe(false)
    expect(clipboard.copySelection).toHaveBeenCalledOnce()
  })

  it('requests a keyboard paste that falls back to the system clipboard at its target', () => {
    expect(press('v', { primary: true })).toBe(false)
    expect(clipboard.requestKeyboardPaste).toHaveBeenCalledOnce()
    const fallback = vi.mocked(clipboard.requestKeyboardPaste).mock
      .calls[0]![0] as KeyboardPasteFallback
    const valid = () => true
    fallback({ x: 3, y: 4 }, valid)
    expect(pasteFromSystemClipboard).toHaveBeenCalledWith(
      clipboard,
      undefined,
      { x: 3, y: 4 },
      valid
    )
  })

  it('matches style copy and paste on the physical key because ⌥ changes the character', () => {
    expect(press('ç', { primary: true, altKey: true, code: 'KeyC' })).toBe(true)
    expect(copySelectedStyle).toHaveBeenCalledOnce()
    expect(clipboard.copySelection).not.toHaveBeenCalled()
    expect(press('√', { primary: true, altKey: true, code: 'KeyV' })).toBe(true)
    expect(pasteStyleToSelection).toHaveBeenCalledOnce()
    expect(clipboard.requestKeyboardPaste).not.toHaveBeenCalled()
    expect(press('z', { primary: true, altKey: true, code: 'KeyZ' })).toBe(false)
    expect(doc.undo).not.toHaveBeenCalled()
  })

  it('leaves unknown combinations alone', () => {
    expect(press('q', { primary: true })).toBe(false)
    expect(press('k', { primary: true, shiftKey: true })).toBe(false)
  })

  it('uses ⌘ on macOS and Ctrl elsewhere', () => {
    expect(press('z', { ctrlKey: true })).toBe(false)
    expect(doc.undo).not.toHaveBeenCalled()
    useMac(false)
    expect(press('z', { metaKey: true })).toBe(false)
    expect(press('z', { ctrlKey: true })).toBe(true)
    expect(doc.undo).toHaveBeenCalledOnce()
  })

  it('accepts Ctrl+Y as redo on Windows only', () => {
    expect(press('y', { primary: true })).toBe(false)
    expect(doc.redo).not.toHaveBeenCalled()
    useMac(false)
    expect(press('y', { primary: true })).toBe(true)
    expect(doc.redo).toHaveBeenCalledOnce()
  })
})

describe('unmodified keys', () => {
  it('Escape closes the menu, commits text, clears the selection and returns to select', () => {
    expect(press('Escape')).toBe(true)
    expect(hideMenu).toHaveBeenCalledOnce()
    expect(tools.setEditingTextId).toHaveBeenCalledWith(null)
    expect(doc.clearSelection).toHaveBeenCalledOnce()
    expect(tools.setTool).toHaveBeenCalledWith('select')
  })

  it.each(['Delete', 'Backspace'])('%s deletes the selection', (key) => {
    expect(press(key)).toBe(true)
    expect(doc.deleteSelected).toHaveBeenCalledOnce()
  })

  it('holds space for panning', () => {
    expect(press(' ')).toBe(true)
    expect(tools.setSpaceHeld).toHaveBeenCalledWith(true)
  })

  it('edits text on Enter and frame names on F2, claiming the key only when editing starts', () => {
    expect(press('Enter')).toBe(true)
    expect(startEditingSelection).toHaveBeenLastCalledWith({ frames: false })
    expect(press('F2')).toBe(true)
    expect(startEditingSelection).toHaveBeenLastCalledWith({ frames: true })
    vi.mocked(startEditingSelection).mockReturnValueOnce(false)
    expect(press('Enter')).toBe(false)
  })

  it('starts the slide show on F5 and from the selection on ⇧F5, ending text editing', () => {
    expect(press('F5')).toBe(true)
    expect(presentation.start).toHaveBeenCalledOnce()
    expect(press('F5', { shiftKey: true })).toBe(true)
    expect(presentFromSelection).toHaveBeenCalledOnce()
    expect(tools.setEditingTextId.mock.calls).toEqual([[null], [null]])
    expect(press('F5', { altKey: true })).toBe(false)
    expect(press('F5', { ctrlKey: true })).toBe(false)
    useMac(false)
    expect(press('F5', { metaKey: true })).toBe(false)
    expect(presentation.start).toHaveBeenCalledOnce()
  })

  it('opens shortcut help on a bare K only', () => {
    expect(press('K')).toBe(true)
    expect(useShortcutHelpStore.getState().open).toBe(true)
    useShortcutHelpStore.setState({ open: false })
    expect(press('k', { altKey: true })).toBe(false)
    expect(press('K', { shiftKey: true })).toBe(false)
    expect(press('k', { ctrlKey: true })).toBe(false)
    useMac(false)
    expect(press('k', { metaKey: true })).toBe(false)
    expect(useShortcutHelpStore.getState().open).toBe(false)
  })

  it('fits content on ⇧1 and the selection on ⇧2 on any layout', () => {
    expect(press('!', { shiftKey: true })).toBe(true)
    expect(press('+', { shiftKey: true, code: 'Digit1' })).toBe(true)
    expect(zoomToContent).toHaveBeenCalledTimes(2)
    expect(press('@', { shiftKey: true })).toBe(true)
    expect(press('"', { shiftKey: true, code: 'Digit2' })).toBe(true)
    expect(zoomToSelection).toHaveBeenCalledTimes(2)
    expect(press('1')).toBe(false)
  })

  it('nudges by 1 and by 10 with Shift', () => {
    press('ArrowLeft')
    press('ArrowRight')
    press('ArrowUp', { shiftKey: true })
    press('ArrowDown', { shiftKey: true })
    expect(doc.translateSelected.mock.calls).toEqual([
      [{ x: -1, y: 0 }],
      [{ x: 1, y: 0 }],
      [{ x: 0, y: -10 }],
      [{ x: 0, y: 10 }]
    ])
  })

  it.each([
    ['v', 'select'],
    ['H', 'hand'],
    ['t', 'text'],
    ['r', 'rectangle'],
    ['o', 'ellipse'],
    ['d', 'diamond'],
    ['f', 'frame'],
    ['l', 'connector'],
    ['c', 'connector']
  ])('%s picks the %s tool', (key, tool) => {
    expect(press(key)).toBe(true)
    expect(tools.setTool).toHaveBeenCalledWith(tool)
  })

  it('ignores Shift with tool letters and keys it does not know', () => {
    expect(press('R', { shiftKey: true })).toBe(false)
    expect(press('q')).toBe(false)
    expect(tools.setTool).not.toHaveBeenCalled()
  })
})
