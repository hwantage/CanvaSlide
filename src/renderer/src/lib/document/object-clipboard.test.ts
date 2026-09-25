import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseClipboardPayload } from '@shared/canvas/clipboard-payload'
import { createEmptyDocument, type CanvasElement, type Point } from '@shared/canvas/element-types'
import { useDocumentStore } from '@/store/document-store'
import type { PastePointer } from '@/lib/interaction/canvas-paste-pointer'
import { createObjectClipboard, type ObjectClipboard } from './object-clipboard'

const text = (id: string): CanvasElement => ({
  id,
  type: 'text',
  text: 'x',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  textStyle: { color: '#000', fontSize: 16, align: 'left', bold: false }
})

const elementCount = () => useDocumentStore.getState().document.order.length

let pointer: PastePointer
let clipboard: ObjectClipboard
const pasteMemory = (target: Point | null) =>
  clipboard.pasteObjects(clipboard.memoryPayload()!, target)
const requestKeyboardPaste = () => clipboard.requestKeyboardPaste(pasteMemory)

describe('object-clipboard keyboard fallback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    pointer = { revision: 0, world: null }
    clipboard = createObjectClipboard(() => pointer)
    useDocumentStore.getState().loadDocument(createEmptyDocument(), null)
    useDocumentStore.getState().insertElement(text('a'))
    clipboard.copySelection()
  })
  afterEach(() => {
    clipboard.nativePasteArrived()
    vi.useRealTimers()
  })

  it('pastes from memory only when no native paste event arrives', () => {
    requestKeyboardPaste()
    vi.runAllTimers()
    expect(elementCount()).toBe(2)
  })

  it('is cancelled by the native paste event, whichever data it carries', () => {
    requestKeyboardPaste()
    clipboard.nativePasteArrived()
    vi.runAllTimers()
    expect(elementCount()).toBe(1)
  })

  it('does not fire before the native event has had time to arrive', () => {
    requestKeyboardPaste()
    vi.advanceTimersByTime(50)
    expect(elementCount()).toBe(1)
    clipboard.nativePasteArrived()
    vi.runAllTimers()
    expect(elementCount()).toBe(1)
  })

  it('waits 200 ms for the native event before falling back', () => {
    requestKeyboardPaste()
    vi.advanceTimersByTime(199)
    expect(elementCount()).toBe(1)
    vi.advanceTimersByTime(1)
    expect(elementCount()).toBe(2)
  })

  it('keeps one fallback per keypress so rapid ⌘V ⌘V pastes twice', () => {
    requestKeyboardPaste()
    vi.advanceTimersByTime(100)
    requestKeyboardPaste()
    vi.runAllTimers()
    expect(elementCount()).toBe(3)
  })

  it('tells a running fallback when a native paste arrives after all', () => {
    let valid: (() => boolean) | undefined
    clipboard.requestKeyboardPaste((_target, isValid) => {
      valid = isValid
    })
    vi.runAllTimers()
    expect(valid?.()).toBe(true)
    clipboard.nativePasteArrived()
    expect(valid?.()).toBe(false)
  })

  it('keeps copies and pending pastes within each clipboard', () => {
    const other = createObjectClipboard(() => pointer)
    expect(other.memoryPayload()).toBeNull()
    requestKeyboardPaste()
    other.nativePasteArrived()
    vi.runAllTimers()
    expect(elementCount()).toBe(2)
    let valid: (() => boolean) | undefined
    clipboard.requestKeyboardPaste((_target, isValid) => {
      valid = isValid
    })
    vi.runAllTimers()
    other.nativePasteArrived()
    expect(valid?.()).toBe(true)
  })

  it('writes the copied payload to the system clipboard as JSON', () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    try {
      const payload = clipboard.copySelection()
      expect(writeText).toHaveBeenCalledWith(JSON.stringify(payload))
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('never substitutes the in-memory copy for foreign clipboard text', () => {
    expect(clipboard.memoryPayload()).not.toBeNull()
    expect(parseClipboardPayload('')).toBeNull()
    expect(parseClipboardPayload('hello')).toBeNull()
    expect(parseClipboardPayload(JSON.stringify(clipboard.memoryPayload()))).not.toBeNull()
  })
})

describe('object clipboard placement', () => {
  beforeEach(() => {
    pointer = { revision: 1, world: { x: 50, y: 50 } }
    clipboard = createObjectClipboard(() => pointer)
    useDocumentStore.getState().loadDocument(createEmptyDocument(), null)
    useDocumentStore.getState().insertElement(text('a'))
    clipboard.copySelection()
  })
  afterEach(() => {
    clipboard.nativePasteArrived()
    vi.useRealTimers()
  })
  const selected = () => {
    const state = useDocumentStore.getState()
    return state.document.elements[state.selectedIds[0]!]!
  }

  it('resets movement and cascade on each copy, including a new copy at the same pointer', () => {
    clipboard.pasteObjects(clipboard.memoryPayload()!)
    expect(selected()).toMatchObject({ x: 24, y: 24 })
    pointer = { revision: 2, world: { x: 800, y: 600 } }
    clipboard.pasteObjects(clipboard.memoryPayload()!)
    expect(selected()).toMatchObject({ x: 795, y: 595 })
    clipboard.copySelection()
    clipboard.pasteObjects(clipboard.memoryPayload()!)
    expect(selected()).toMatchObject({ x: 819, y: 619 })
  })

  it('restarts the cascade when the same content is copied again', () => {
    const payload = clipboard.memoryPayload()!
    clipboard.pasteObjects(payload, null)
    clipboard.pasteObjects(payload, null)
    expect(selected()).toMatchObject({ x: 48, y: 48 })
    useDocumentStore.getState().setSelection(['a'])
    clipboard.copySelection()
    clipboard.pasteObjects(clipboard.memoryPayload()!, null)
    expect(selected()).toMatchObject({ x: 24, y: 24 })
  })

  it('keeps paste targets and cascades within each clipboard', () => {
    const other = createObjectClipboard(() => pointer)
    pointer = { revision: 5, world: { x: 800, y: 600 } }
    other.copySelection()
    pointer = { revision: 3, world: { x: 1, y: 1 } }
    expect(clipboard.objectPasteTarget()).toEqual({ x: 1, y: 1 })
    expect(other.objectPasteTarget()).toBeNull()
    const payload = clipboard.memoryPayload()!
    clipboard.pasteObjects(payload, null)
    clipboard.pasteObjects(payload, null)
    other.pasteObjects(payload, null)
    expect(selected()).toMatchObject({ x: 24, y: 24 })
  })

  it('falls back to source offsets when the pointer is outside and pastes in one undo step', () => {
    pointer = { revision: 2, world: null }
    clipboard.pasteObjects(clipboard.memoryPayload()!)
    expect(selected()).toMatchObject({ x: 24, y: 24 })
    useDocumentStore.getState().undo()
    expect(elementCount()).toBe(1)
    useDocumentStore.getState().redo()
    expect(elementCount()).toBe(2)
    expect(Object.values(useDocumentStore.getState().document.elements)[1]).toMatchObject({
      x: 24,
      y: 24
    })
  })

  it('copies a selected frame with its contents without changing the visible selection', () => {
    const store = useDocumentStore.getState()
    store.insertElement({
      id: 'f',
      type: 'frame',
      name: 'Frame',
      order: 1,
      x: -10,
      y: -10,
      width: 100,
      height: 100
    })
    const payload = clipboard.copySelection()!
    expect(payload.elements.map((element) => element.id)).toEqual(['a', 'f'])
    expect(useDocumentStore.getState().selectedIds).toEqual(['f'])
    clipboard.pasteObjects(payload, { x: 500, y: 400 })
    const state = useDocumentStore.getState()
    expect(state.selectedIds).toHaveLength(2)
    expect(state.document.elements[state.selectedIds[0]!]).toMatchObject({
      type: 'text',
      x: 460,
      y: 360
    })
    expect(state.document.elements[state.selectedIds[1]!]).toMatchObject({
      type: 'frame',
      x: 450,
      y: 350
    })
    state.undo()
    expect(useDocumentStore.getState().document.order).toEqual(['a', 'f'])
    useDocumentStore.getState().redo()
    expect(elementCount()).toBe(4)
  })

  it('cuts the same frame contents it copies and restores everything in one undo step', () => {
    const store = useDocumentStore.getState()
    store.insertElement({ ...text('outside'), x: 200 })
    store.insertElement({
      id: 'f',
      type: 'frame',
      name: 'Frame',
      order: 1,
      x: -10,
      y: -10,
      width: 100,
      height: 100
    })
    expect(clipboard.cutSelection()!.elements.map((element) => element.id)).toEqual(['a', 'f'])
    expect(useDocumentStore.getState().document.order).toEqual(['outside'])
    useDocumentStore.getState().undo()
    expect(useDocumentStore.getState().document.order).toEqual(['a', 'outside', 'f'])
    useDocumentStore.getState().redo()
    expect(useDocumentStore.getState().document.order).toEqual(['outside'])
  })

  it('captures the keyboard destination before the delayed fallback reads the clipboard', () => {
    vi.useFakeTimers()
    pointer = { revision: 2, world: { x: 800, y: 600 } }
    requestKeyboardPaste()
    pointer = { revision: 3, world: { x: 1000, y: 900 } }
    vi.runAllTimers()
    expect(selected()).toMatchObject({ x: 795, y: 595 })
  })
})
