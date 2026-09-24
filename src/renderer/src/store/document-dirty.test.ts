import { beforeEach, describe, expect, it } from 'vitest'
import { createEmptyDocument, defaultTextStyle } from '@shared/canvas/element-types'
import { useDocumentStore } from './document-store'

const store = () => useDocumentStore.getState()
const dirty = () => store().dirty
function open() {
  const document = createEmptyDocument('Opened')
  document.elements.text = {
    id: 'text',
    type: 'text',
    text: 'Hello',
    x: 0,
    y: 0,
    width: 200,
    height: 28,
    textStyle: defaultTextStyle
  }
  document.order = ['text']
  store().loadDocument(document, '/tmp/opened.canvaslide')
}
const save = () => store().completeSave(store().takeSaveSnapshot(), '/tmp/saved.canvaslide')

describe('document clean baseline', () => {
  beforeEach(open)

  it('clears dirty on undo to opened content and restores it on redo', () => {
    expect(dirty()).toBe(false)
    store().patchElements(['text'], { x: 10 })
    store().renameDocument('Edited')
    store().undo()
    expect(dirty()).toBe(true)
    store().undo()
    expect(dirty()).toBe(false)
    store().redo()
    expect(dirty()).toBe(true)
  })

  it('tracks a save in the middle of undo history in both directions', () => {
    store().patchElements(['text'], { x: 10 })
    store().patchElements(['text'], { x: 20 })
    store().undo()
    save()
    expect(dirty()).toBe(false)
    store().undo()
    expect(dirty()).toBe(true)
    store().redo()
    expect(dirty()).toBe(false)
    store().redo()
    expect(dirty()).toBe(true)
    store().undo()
    expect(dirty()).toBe(false)
  })

  it('recognizes equal content without snapshot identity, after branch edits and history eviction', () => {
    for (let i = 0; i < 110; i++) {
      store().renameDocument(`Edit ${i}`)
    }
    store().renameDocument('Opened')
    expect(dirty()).toBe(false)
    store().undo()
    expect(dirty()).toBe(true)
    store().renameDocument('Opened')
    expect(dirty()).toBe(false)
    expect(store().future).toHaveLength(0)
  })

  it('preserves unsaved content when a save finishes after undoing to an older clean baseline', () => {
    store().renameDocument('Saving')
    const snapshot = store().takeSaveSnapshot()
    store().undo()
    expect(dirty()).toBe(false)
    store().completeSave(snapshot, '/tmp/saved.canvaslide')
    expect(dirty()).toBe(true)
    store().redo()
    expect(dirty()).toBe(false)
  })

  it('allows edit then undo during a save to finish clean', () => {
    store().renameDocument('Saving')
    const snapshot = store().takeSaveSnapshot()
    store().patchElements(['text'], { x: 30 })
    store().undo()
    store().completeSave(snapshot, '/tmp/saved.canvaslide')
    expect(dirty()).toBe(false)
  })

  it('restores clean or dirty status when a live gesture is cancelled', () => {
    store().beginEdit()
    store().patchElements(['text'], { x: 10 }, false)
    expect(dirty()).toBe(true)
    store().cancelEdit()
    expect(dirty()).toBe(false)
    store().renameDocument('Unsaved')
    store().beginEdit()
    store().patchElements(['text'], { x: 20 }, false)
    store().cancelEdit()
    expect(dirty()).toBe(true)
  })

  it('clears dirty when a live drag returns to its saved position', () => {
    store().beginEdit()
    store().patchElements(['text'], { x: 20 }, false)
    expect(dirty()).toBe(true)
    store().patchElements(['text'], { x: 0 }, false)
    store().endEdit()
    expect(dirty()).toBe(false)
  })

  it('keeps edits made during a save dirty until undone to the saved snapshot', () => {
    store().renameDocument('Saving')
    const snapshot = store().takeSaveSnapshot()
    store().patchElements(['text'], { x: 30 })
    store().completeSave(snapshot, '/tmp/saved.canvaslide')
    expect(dirty()).toBe(true)
    store().undo()
    expect(dirty()).toBe(false)
  })

  it('compares a cancelled gesture with a save completed during that gesture', () => {
    store().beginEdit()
    store().patchElements(['text'], { x: 30 }, false)
    save()
    store().cancelEdit()
    expect(dirty()).toBe(true)
    store().patchElements(['text'], { x: 30 })
    expect(dirty()).toBe(false)
  })

  it('keeps the new file baseline when an old file save finishes', () => {
    store().renameDocument('Saving')
    const snapshot = store().takeSaveSnapshot()
    store().loadDocument(createEmptyDocument('Other file'), '/tmp/other.canvaslide')
    store().renameDocument('Unsaved')
    store().completeSave(snapshot, '/tmp/old.canvaslide')
    expect(store().filePath).toBe('/tmp/other.canvaslide')
    expect(dirty()).toBe(true)
    store().undo()
    expect(dirty()).toBe(false)
    expect(store().document.name).toBe('Other file')
  })

  it('keeps measured load/save/history states clean while detecting real text edits', () => {
    store().syncTextHeight('text', 80)
    expect(dirty()).toBe(false)
    const snapshot = store().takeSaveSnapshot()
    store().syncTextHeight('text', 90)
    store().completeSave(snapshot, '/tmp/saved.canvaslide')
    expect(dirty()).toBe(false)
    store().patchElements(['text'], { text: 'Changed' })
    store().syncTextHeight('text', 120)
    expect(dirty()).toBe(true)
    store().undo()
    expect(dirty()).toBe(false)
    store().redo()
    expect(dirty()).toBe(true)
  })

  it('replaces the baseline on new/open and ignores saves from a previous session', () => {
    store().renameDocument('Unsaved')
    const snapshot = store().takeSaveSnapshot()
    store().loadDocument(createEmptyDocument(), null)
    store().completeSave(snapshot, '/tmp/old.canvaslide')
    expect(dirty()).toBe(false)
    expect(store().filePath).toBeNull()
    store().renameDocument('Another')
    open()
    expect(dirty()).toBe(false)
    expect(store().past).toEqual([])
    store().renameDocument('Changed')
    store().undo()
    expect(dirty()).toBe(false)
  })
})
