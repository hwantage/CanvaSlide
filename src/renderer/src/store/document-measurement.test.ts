import { beforeEach, describe, expect, it } from 'vitest'
import {
  createEmptyDocument,
  defaultTextStyle,
  type CanvasDocument
} from '@shared/canvas/element-types'
import { useDocumentStore } from './document-store'

const state = () => useDocumentStore.getState()

beforeEach(() => {
  const document: CanvasDocument = {
    ...createEmptyDocument(),
    elements: {
      text: {
        id: 'text',
        type: 'text',
        x: 0,
        y: 0,
        width: 100,
        height: 200,
        text: 'Hello',
        textStyle: { ...defaultTextStyle, fontSize: 20 }
      }
    },
    order: ['text']
  }
  state().loadDocument(document, '/tmp/opened.canvaslide')
})

describe('renderer measurements', () => {
  it('updates opened text bounds without dirtying the document or adding history', () => {
    state().syncTextHeight('text', 28)
    expect(state().document.elements.text?.height).toBe(28)
    expect(state().dirty).toBe(false)
    expect(state().past).toEqual([])
    expect(state().future).toEqual([])
    expect(state().filePath).toBe('/tmp/opened.canvaslide')
  })

  it('does not create an undo step when layout changes during focus/blur without typing', () => {
    state().beginEdit()
    state().syncTextHeight('text', 28)
    state().endEdit()
    expect(state().past).toEqual([])
    expect(state().dirty).toBe(false)
  })

  it('keeps typing and measured growth in one undo step and preserves redo', () => {
    state().syncTextHeight('text', 28)
    state().beginEdit()
    state().patchElements(['text'], { text: 'Hello\nWorld' }, false)
    state().syncTextHeight('text', 56)
    expect(state().dirty).toBe(true)
    state().endEdit()
    expect(state().past).toHaveLength(1)
    state().undo()
    expect(state().document.elements.text).toMatchObject({ text: 'Hello', height: 28 })
    state().syncTextHeight('text', 30)
    expect(state().future).toHaveLength(1)
    state().redo()
    expect(state().document.elements.text).toMatchObject({ text: 'Hello\nWorld', height: 56 })
    expect(state().dirty).toBe(true)
  })

  it('finishes saving when only a late measurement changed the document', () => {
    state().patchElements(['text'], { text: 'Edited' })
    const snapshot = state().takeSaveSnapshot()
    state().syncTextHeight('text', 28)
    state().completeSave(snapshot, '/tmp/saved.canvaslide')
    expect(state().dirty).toBe(false)
    state().syncTextHeight('text', 56)
    expect(state().dirty).toBe(false)
  })

  it('does not invalidate a save when cancelling an unchanged edit session', () => {
    state().patchElements(['text'], { text: 'Edited' })
    const snapshot = state().takeSaveSnapshot()
    state().beginEdit()
    state().syncTextHeight('text', 28)
    state().cancelEdit()
    state().completeSave(snapshot, '/tmp/saved.canvaslide')
    expect(state().dirty).toBe(false)
  })

  it.each(['recorded', 'live', 'undo', 'redo', 'cancel'] as const)(
    'keeps a %s edit dirty when a measurement and save finish afterward',
    (action) => {
      state().patchElements(['text'], { text: 'Edited' })
      if (action === 'redo') {
        state().undo()
      }
      if (action === 'cancel') {
        state().beginEdit()
        state().patchElements(['text'], { text: 'Draft' }, false)
      }
      const snapshot = state().takeSaveSnapshot()
      if (action === 'recorded') {
        state().patchElements(['text'], { x: 20 })
      }
      if (action === 'live') {
        state().patchElements(['text'], { text: 'Later' }, false)
      }
      if (action === 'undo') {
        state().undo()
      }
      if (action === 'redo') {
        state().redo()
      }
      if (action === 'cancel') {
        state().cancelEdit()
      }
      state().syncTextHeight('text', 28)
      state().completeSave(snapshot, '/tmp/saved.canvaslide')
      expect(state().dirty).toBe(true)
    }
  )
})
