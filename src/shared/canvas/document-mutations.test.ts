import { describe, expect, it } from 'vitest'
import {
  applyFrameOrders,
  cloneElements,
  duplicateElements,
  insertElement,
  insertElements,
  patchElements,
  removeElements,
  reorderZ,
  translateElements
} from './document-mutations'
import { createEmptyDocument, type CanvasElement } from './element-types'
import { parseDocument, serializeDocument } from './document-file'

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
  it('batch inserts retain last-occurrence order, existing assets, and the original document', () => {
    const asset = { id: 'a', mime: 'image/png', data: 'original', width: 1, height: 1 }
    const original = {
      ...insertElement(createEmptyDocument(), text('existing')),
      assets: { a: asset }
    }
    const result = insertElements(
      original,
      [text('a'), text('existing', 5), text('b'), text('a', 10)],
      [
        { ...asset, data: 'duplicate' },
        { ...asset, id: 'new' }
      ]
    )
    expect(result.order).toEqual(['existing', 'b', 'a'])
    expect(result.elements.existing?.x).toBe(5)
    expect(result.elements.a?.x).toBe(10)
    expect(result.assets.a).toBe(asset)
    expect(result.assets.new).toEqual({ ...asset, id: 'new' })
    expect(original.order).toEqual(['existing'])
    expect(original.elements.existing?.x).toBe(0)
    expect(original.assets).toEqual({ a: asset })
    expect(insertElements(original, [])).toBe(original)
  })
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

  it('preserves an existing image when its asset is missing during duplication', () => {
    const image: CanvasElement = {
      id: 'image',
      type: 'image',
      assetId: 'missing',
      naturalWidth: 100,
      naturalHeight: 80,
      x: 10,
      y: 20,
      width: 100,
      height: 80
    }
    const doc = insertElement(createEmptyDocument(), image)
    expect(parseDocument(serializeDocument(doc)).ok).toBe(true)
    const copy = duplicateElements(doc, ['image'], () => 'copy')
    expect(copy.newIds).toEqual(['copy'])
    expect(copy.document.elements.copy).toEqual({ ...image, id: 'copy', x: 34, y: 44 })
    expect(doc.order).toEqual(['image'])
  })

  it('clones with the connector, group and frame rules the caller picks', () => {
    const host = (id: string, x: number): CanvasElement => ({
      id,
      type: 'shape',
      shape: 'rectangle',
      x,
      y: 0,
      width: 100,
      height: 100,
      style: { fill: '#fff', stroke: '#000', strokeWidth: 1, cornerRadius: 0 },
      text: '',
      textStyle: { color: '#000', fontSize: 12, align: 'left', bold: false }
    })
    const link: CanvasElement = {
      id: 'c',
      type: 'connector',
      x: 100,
      y: 50,
      width: 200,
      height: 1,
      route: 'straight',
      startHead: 'none',
      endHead: 'arrow',
      style: { stroke: '#000', strokeWidth: 1, dashed: false },
      label: '',
      textStyle: { color: '#000', fontSize: 12, align: 'center', bold: false },
      start: { x: 100, y: 50, elementId: 'a', side: 'right' },
      end: { x: 300, y: 50, elementId: 'b', side: 'left' }
    }
    let doc = createEmptyDocument()
    for (const element of [host('a', 0), host('b', 300), link]) {
      doc = insertElement(doc, { ...element, groupId: 'g' })
    }
    doc = insertElement(doc, {
      id: 'f',
      type: 'frame',
      name: 'F',
      order: 1,
      x: 0,
      y: 0,
      width: 1,
      height: 1
    })
    let n = 0
    const makeId = () => `n${(n += 1)}`
    const kept = cloneElements(doc, [doc.elements.a!, doc.elements.c!, doc.elements.f!], makeId, {
      offset: { x: 10, y: 0 },
      keepMissingHosts: true,
      renumberFrames: false
    })
    // Why: the copied host is re-pointed, the one left behind stays attached, and the group is new.
    expect(kept.document.elements.n2).toMatchObject({
      start: { elementId: 'n1' },
      end: { elementId: 'b' },
      groupId: 'n4'
    })
    expect(kept.document.elements.n3).toMatchObject({ type: 'frame', order: 1, x: 10 })
    expect(kept.document.elements.n1).toMatchObject({ x: 10, groupId: 'n4' })
    const detached = cloneElements(doc, [doc.elements.c!, doc.elements.f!], makeId, {
      offset: { x: 0, y: 5 },
      keepMissingHosts: false,
      renumberFrames: true
    })
    const copy = detached.document.elements.n5
    expect(copy?.type === 'connector' && copy.start).toEqual({ x: 100, y: 55 })
    expect(copy?.type === 'connector' && copy.end).toEqual({ x: 300, y: 55 })
    expect(detached.document.elements.n6).toMatchObject({ type: 'frame', order: 2 })
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
