import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseClipboardPayload } from '@shared/canvas/clipboard-payload'
import { createEmptyDocument, type CanvasElement } from '@shared/canvas/element-types'
import { useDocumentStore } from '@/store/document-store'
import {
  copySelection,
  memoryPayload,
  nativePasteArrived,
  requestKeyboardPaste
} from './object-clipboard'

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
