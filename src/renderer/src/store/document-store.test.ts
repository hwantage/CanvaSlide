import { beforeEach, describe, expect, it } from 'vitest'
import { createEmptyDocument, type CanvasElement } from '@shared/canvas/element-types'
import { useDocumentStore } from './document-store'

const frame = (id: string, order: number): CanvasElement => ({
  id,
  type: 'frame',
  name: id,
  order,
  x: 0,
  y: 0,
  width: 100,
  height: 100
})

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

describe('document-store', () => {
  beforeEach(() => {
    useDocumentStore.getState().loadDocument(createEmptyDocument(), null)
  })

  it('records inserts and supports undo/redo with selection pruning', () => {
    const store = useDocumentStore.getState()
    store.insertElement(text('a'))
    expect(useDocumentStore.getState().selectedIds).toEqual(['a'])
    expect(useDocumentStore.getState().dirty).toBe(true)
    store.undo()
    expect(useDocumentStore.getState().document.order).toEqual([])
    expect(useDocumentStore.getState().selectedIds).toEqual([])
    store.redo()
    expect(useDocumentStore.getState().document.order).toEqual(['a'])
  })

  it('collapses a drag (beginEdit → live patches → endEdit) into one undo step', () => {
    const store = useDocumentStore.getState()
    store.insertElement(text('a'))
    store.beginEdit()
    store.patchElements(['a'], { x: 10 }, false)
    store.patchElements(['a'], { x: 20 }, false)
    store.patchElements(['a'], { x: 30 }, false)
    store.endEdit()
    expect(useDocumentStore.getState().past).toHaveLength(2)
    store.undo()
    expect(useDocumentStore.getState().document.elements.a?.x).toBe(0)
  })

  it('does not record an edit session that changed nothing', () => {
    const store = useDocumentStore.getState()
    store.insertElement(text('a'))
    store.beginEdit()
    store.endEdit()
    expect(useDocumentStore.getState().past).toHaveLength(1)
  })

  it('duplicates, deletes and reorders the selection', () => {
    const store = useDocumentStore.getState()
    store.insertElement(text('a'))
    store.insertElement(text('b'))
    store.setSelection(['a'])
    store.duplicateSelected()
    const state = useDocumentStore.getState()
    expect(state.document.order).toHaveLength(3)
    expect(state.selectedIds).toHaveLength(1)
    expect(state.selectedIds[0]).not.toBe('a')
    store.setSelection(['a'])
    store.reorderSelected('front')
    expect(useDocumentStore.getState().document.order.at(-1)).toBe('a')
    store.deleteSelected()
    expect(useDocumentStore.getState().document.elements.a).toBeUndefined()
    expect(useDocumentStore.getState().selectedIds).toEqual([])
  })

  it('moves frame order and renumbers', () => {
    const store = useDocumentStore.getState()
    store.insertElement(frame('f1', 1))
    store.insertElement(frame('f2', 2))
    store.moveFrameOrder('f2', 'up')
    const { elements } = useDocumentStore.getState().document
    expect(elements.f2).toMatchObject({ order: 1 })
    expect(elements.f1).toMatchObject({ order: 2 })
    // No-op moves must not create history entries.
    const before = useDocumentStore.getState().past.length
    store.moveFrameOrder('f2', 'up')
    expect(useDocumentStore.getState().past).toHaveLength(before)
  })

  it('tracks saved state and keeps the document name the user chose', () => {
    const store = useDocumentStore.getState()
    store.insertElement(text('a'))
    store.renameDocument('My Deck')
    const snapshot = store.takeSaveSnapshot()
    store.completeSave(snapshot, '/tmp/my-deck.canvas.json')
    expect(useDocumentStore.getState().dirty).toBe(false)
    expect(useDocumentStore.getState().filePath).toBe('/tmp/my-deck.canvas.json')
    expect(useDocumentStore.getState().document.name).toBe('My Deck')
    expect(useDocumentStore.getState().past).toHaveLength(2)
    store.updateSettings({ transitionMs: 500 })
    expect(useDocumentStore.getState().dirty).toBe(true)
  })

  it('keeps the document dirty when it changed while the save was in flight', () => {
    const store = useDocumentStore.getState()
    store.insertElement(text('a'))
    const snapshot = store.takeSaveSnapshot()
    store.insertElement(text('b'))
    store.completeSave(snapshot, '/tmp/a.canvas.json')
    expect(useDocumentStore.getState().dirty).toBe(true)
    expect(useDocumentStore.getState().filePath).toBe('/tmp/a.canvas.json')
  })

  it('ignores a save that finishes after switching to another document', () => {
    const store = useDocumentStore.getState()
    store.insertElement(text('a'))
    const snapshot = store.takeSaveSnapshot()
    store.newDocument()
    store.insertElement(text('c'))
    store.completeSave(snapshot, '/tmp/old.canvas.json')
    const state = useDocumentStore.getState()
    expect(state.filePath).toBeNull()
    expect(state.dirty).toBe(true)
  })
})
