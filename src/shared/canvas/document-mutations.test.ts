import { describe, expect, it } from 'vitest'
import {
  applyFrameOrders,
  duplicateElements,
  insertElement,
  patchElements,
  removeElements,
  reorderZ,
  translateElements
} from './document-mutations'
import { createEmptyDocument, type CanvasElement } from './element-types'

const text = (id: string, x = 0): CanvasElement => ({
  id,
  type: 'text',
  text: id,
  x,
  y: 0,
  width: 10,
  height: 10,
  textStyle: { color: '#000', fontSize: 16, align: 'left', bold: false }
})

describe('document-mutations', () => {
  it('inserts on top and removes cleanly without mutating input', () => {
    const empty = createEmptyDocument()
    const one = insertElement(empty, text('a'))
    const two = insertElement(one, text('b'))
    expect(empty.order).toEqual([])
    expect(two.order).toEqual(['a', 'b'])
    const removed = removeElements(two, ['a', 'ghost'])
    expect(removed.order).toEqual(['b'])
    expect(removed.elements.a).toBeUndefined()
    expect(two.elements.a).toBeDefined()
  })

  it('patches with objects or updaters and returns same doc when nothing changed', () => {
    const doc = insertElement(createEmptyDocument(), text('a'))
    expect(patchElements(doc, ['nope'], { x: 5 })).toBe(doc)
    expect(patchElements(doc, ['a'], { x: 5 }).elements.a?.x).toBe(5)
    expect(translateElements(doc, ['a'], { x: 3, y: 4 }).elements.a).toMatchObject({ x: 3, y: 4 })
  })

  it('duplicates with offset preserving stacking', () => {
    let doc = insertElement(createEmptyDocument(), text('a'))
    doc = insertElement(doc, text('b', 100))
    let n = 0
    const { document, newIds } = duplicateElements(doc, ['b', 'a'], () => `dup${(n += 1)}`)
    expect(newIds).toEqual(['dup1', 'dup2'])
    expect(document.order).toEqual(['a', 'b', 'dup1', 'dup2'])
    expect(document.elements.dup2).toMatchObject({ x: 124, y: 24, text: 'b' })
  })

  it('steps z one position, keeping selected runs together and stopping at the edges', () => {
    let doc = createEmptyDocument()
    for (const id of ['a', 'b', 'c', 'd']) {
      doc = insertElement(doc, text(id))
    }
    expect(reorderZ(doc, ['a'], 'forward').order).toEqual(['b', 'a', 'c', 'd'])
    expect(reorderZ(doc, ['d'], 'backward').order).toEqual(['a', 'b', 'd', 'c'])
    expect(reorderZ(doc, ['b', 'c'], 'forward').order).toEqual(['a', 'd', 'b', 'c'])
    expect(reorderZ(doc, ['b', 'c'], 'backward').order).toEqual(['b', 'c', 'a', 'd'])
    expect(reorderZ(doc, ['d'], 'forward')).toBe(doc)
    expect(reorderZ(doc, ['a', 'b'], 'backward')).toBe(doc)
    expect(reorderZ(doc, ['a', 'c'], 'forward').order).toEqual(['b', 'a', 'd', 'c'])
  })

  it('leaves a frames-only selection alone, whichever command asks', () => {
    let doc = insertElement(createEmptyDocument(), text('a'))
    for (const id of ['f1', 'f2']) {
      doc = insertElement(doc, {
        id,
        type: 'frame',
        name: id,
        order: 1,
        x: 0,
        y: 0,
        width: 400,
        height: 300
      })
    }
    // Why: frames always paint under content, so restacking them is an invisible edit and an undo
    // step for nothing — the ] and [ shortcuts reach this the same way the panel does.
    for (const direction of ['forward', 'backward', 'front', 'back'] as const) {
      expect(reorderZ(doc, ['f1'], direction)).toBe(doc)
      expect(reorderZ(doc, ['f1', 'f2'], direction)).toBe(doc)
    }
    // A selection that also holds content still restacks.
    expect(reorderZ(doc, ['a', 'f1'], 'front').order).toEqual(['f2', 'a', 'f1'])
  })

  it('reorders z and applies frame orders', () => {
    let doc = insertElement(createEmptyDocument(), text('a'))
    doc = insertElement(doc, text('b'))
    doc = insertElement(doc, text('c'))
    expect(reorderZ(doc, ['a'], 'front').order).toEqual(['b', 'c', 'a'])
    expect(reorderZ(doc, ['c'], 'back').order).toEqual(['c', 'a', 'b'])
    const frameDoc = insertElement(doc, {
      id: 'f',
      type: 'frame',
      name: 'F',
      order: 1,
      x: 0,
      y: 0,
      width: 1,
      height: 1
    })
    const applied = applyFrameOrders(frameDoc, { f: 7, a: 9 })
    expect(applied.elements.f).toMatchObject({ order: 7 })
    expect(applied.elements.a).toEqual(frameDoc.elements.a)
  })
})
