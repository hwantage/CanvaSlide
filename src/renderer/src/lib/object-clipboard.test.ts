import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseClipboardPayload } from '@shared/canvas/clipboard-payload'
import { createEmptyDocument, type CanvasElement } from '@shared/canvas/element-types'
import { useDocumentStore } from '@/store/document-store'
import {
  copySelection,
  memoryPayload,
  nativePasteArrived,
  pasteObjects,
  requestKeyboardPaste
} from './object-clipboard'

import * as pointerTracking from './canvas-paste-pointer'

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

describe('object-clipboard keyboard fallback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useDocumentStore.getState().loadDocument(createEmptyDocument(), null)
    useDocumentStore.getState().insertElement(text('a'))
    copySelection()
  })
  afterEach(() => {
    nativePasteArrived()
    vi.useRealTimers()
  })

  it('pastes from memory only when no native paste event arrives', () => {
    requestKeyboardPaste()
    vi.runAllTimers()
    expect(elementCount()).toBe(2)
  })

  it('is cancelled by the native paste event, whichever data it carries', () => {
    requestKeyboardPaste()
    nativePasteArrived()
    vi.runAllTimers()
    expect(elementCount()).toBe(1)
  })

  it('does not fire before the native event has had time to arrive', () => {
    requestKeyboardPaste()
    vi.advanceTimersByTime(50)
    expect(elementCount()).toBe(1)
    nativePasteArrived()
    vi.runAllTimers()
    expect(elementCount()).toBe(1)
  })

  it('keeps one fallback per keypress so rapid ⌘V ⌘V pastes twice', () => {
    requestKeyboardPaste()
    vi.advanceTimersByTime(100)
    requestKeyboardPaste()
    vi.runAllTimers()
    expect(elementCount()).toBe(3)
  })

  it('never substitutes the in-memory copy for foreign clipboard text', () => {
    expect(memoryPayload()).not.toBeNull()
    expect(parseClipboardPayload('')).toBeNull()
    expect(parseClipboardPayload('hello')).toBeNull()
    expect(parseClipboardPayload(JSON.stringify(memoryPayload()))).not.toBeNull()
  })
})

describe('object clipboard placement', () => {
  let pointer: { revision: number; world: { x: number; y: number } | null }
  beforeEach(() => {
    pointer = { revision: 1, world: { x: 50, y: 50 } }
    vi.spyOn(pointerTracking, 'canvasPastePointer').mockImplementation(() => pointer)
    useDocumentStore.getState().loadDocument(createEmptyDocument(), null)
    useDocumentStore.getState().insertElement(text('a'))
    copySelection()
  })
  afterEach(() => {
    nativePasteArrived()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })
  const selected = () => {
    const state = useDocumentStore.getState()
    return state.document.elements[state.selectedIds[0]!]!
  }

  it('resets movement and cascade on each copy, including a new copy at the same pointer', () => {
    pasteObjects(memoryPayload()!)
    expect(selected()).toMatchObject({ x: 24, y: 24 })
    pointer = { revision: 2, world: { x: 800, y: 600 } }
    pasteObjects(memoryPayload()!)
    expect(selected()).toMatchObject({ x: 795, y: 595 })
    copySelection()
    pasteObjects(memoryPayload()!)
    expect(selected()).toMatchObject({ x: 819, y: 619 })
  })

  it('falls back to source offsets when the pointer is outside and pastes in one undo step', () => {
    pointer = { revision: 2, world: null }
    pasteObjects(memoryPayload()!)
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

  it('captures the keyboard destination before the delayed fallback reads the clipboard', () => {
    vi.useFakeTimers()
    pointer = { revision: 2, world: { x: 800, y: 600 } }
    requestKeyboardPaste()
    pointer = { revision: 3, world: { x: 1000, y: 900 } }
    vi.runAllTimers()
    expect(selected()).toMatchObject({ x: 795, y: 595 })
  })
})
