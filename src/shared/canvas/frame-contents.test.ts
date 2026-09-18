import { describe, expect, it } from 'vitest'
import {
  buildClipboardPayload,
  parseClipboardPayload,
  pasteClipboardPayload
} from './clipboard-payload'
import { parseDocument, serializeDocument } from './document-file'
import {
  duplicateElements,
  insertElements,
  patchElements,
  removeElements,
  translateElements
} from './document-mutations'
import {
  createEmptyDocument,
  defaultShapeStyle,
  defaultTextStyle,
  type CanvasDocument,
  type CanvasElement
} from './element-types'
import { withFrameContents } from './frame-contents'

const frame = (id: string, x = 0, width = 400): CanvasElement => ({
  id,
  type: 'frame',
  name: id,
  order: 0,
  x,
  y: 0,
  width,
  height: 400
})
const shape = (id: string, x = 100): CanvasElement => ({
  id,
  type: 'shape',
  shape: 'rectangle',
  x,
  y: 100,
  width: 60,
  height: 60,
  style: defaultShapeStyle,
  text: '',
  textStyle: defaultTextStyle
})
const scene = () => insertElements(createEmptyDocument(), [frame('f'), shape('a'), shape('b', 220)])

function paste(document: CanvasDocument, ids: string[], prefix = 'copy') {
  const payload = parseClipboardPayload(JSON.stringify(buildClipboardPayload(document, ids)))!
  let count = 0
  return pasteClipboardPayload(document, payload, () => `${prefix}${++count}`, { x: 24, y: 24 })
}

describe('frame contents across overlapping copies', () => {
  it('isolates source and pasted contents without mutating originals or relying on selection', () => {
    const source = scene()
    const { document, newIds } = paste(source, ['f', 'a', 'b'])
    expect(withFrameContents(document, [newIds[0]!])).toEqual(newIds)
    expect(withFrameContents(document, ['f'])).toEqual(source.order)
    const moved = translateElements(document, withFrameContents(document, newIds), { x: 50, y: 60 })
    for (const id of source.order) {
      expect(document.elements[id]).toBe(source.elements[id])
      expect(moved.elements[id]).toBe(source.elements[id])
    }
    expect(moved.elements[newIds[1]!]).toMatchObject({ x: 174, y: 184 })
    expect(withFrameContents(document, [newIds[0]!, 'a'])).toContain('a')
  })

  it('keeps repeated pastes, copies of copies and z-order changes isolated', () => {
    const first = paste(scene(), ['f'])
    const second = paste(first.document, ['f'], 'second')
    const third = paste(second.document, [first.newIds[0]!], 'third')
    for (const ids of [first.newIds, second.newIds, third.newIds]) {
      expect(withFrameContents(third.document, [ids[0]!])).toEqual(ids)
    }
    const reordered = {
      ...third.document,
      order: third.document.order.slice(3).concat(third.document.order.slice(0, 3))
    }
    expect(new Set(withFrameContents(reordered, [first.newIds[0]!]))).toEqual(new Set(first.newIds))
    expect(withFrameContents(third.document, ['f'])).toEqual(['f', 'a', 'b'])
  })

  it('preserves distinct overlapping copy sets when they are copied together', () => {
    const first = paste(scene(), ['f'])
    const combined = paste(first.document, first.document.order, 'both')
    expect(withFrameContents(combined.document, [combined.newIds[0]!])).toEqual(
      combined.newIds.slice(0, 3)
    )
    expect(withFrameContents(combined.document, [combined.newIds[3]!])).toEqual(
      combined.newIds.slice(3)
    )
  })

  it('supports nested/multiple selected frames while keeping unselected frames independent', () => {
    const source = insertElements(scene(), [
      frame('inner', 80, 220),
      frame('other', 600),
      shape('c', 700)
    ])
    const result = paste(source, source.order)
    expect(withFrameContents(result.document, result.newIds)).toEqual(result.newIds)
    expect(withFrameContents(result.document, [result.newIds[0]!])).toEqual(
      result.newIds.slice(0, 3)
    )
    expect(withFrameContents(result.document, [result.newIds[3]!])).toEqual([
      result.newIds[3],
      result.newIds[1],
      result.newIds[2]
    ])
    expect(withFrameContents(result.document, [result.newIds[4]!])).toEqual(result.newIds.slice(4))
  })

  it('keeps the same membership after save/reopen and accepts old documents without keys', () => {
    const result = paste(scene(), ['f'])
    const reopened = parseDocument(serializeDocument(result.document))
    expect(reopened.ok).toBe(true)
    if (!reopened.ok) {
      throw new Error(reopened.error)
    }
    expect(withFrameContents(reopened.document, [result.newIds[0]!])).toEqual(result.newIds)
    const legacy = parseDocument(serializeDocument(scene()))
    expect(legacy.ok).toBe(true)
    if (!legacy.ok) {
      throw new Error(legacy.error)
    }
    expect(withFrameContents(legacy.document, ['f'])).toEqual(['f', 'a', 'b'])
  })

  it('restores spatial containment when contents leave their frame or their frame is deleted', () => {
    const result = paste(scene(), ['f'])
    const copiedFrame = result.newIds[0]!
    const copiedA = result.newIds[1]!
    const outsideCopy = patchElements(result.document, [copiedA], { x: 5, y: 5 })
    expect(withFrameContents(outsideCopy, ['f'])).toContain(copiedA)
    expect(withFrameContents(outsideCopy, [copiedFrame])).not.toContain(copiedA)
    const deleted = removeElements(result.document, [copiedFrame])
    expect(withFrameContents(deleted, ['f'])).toEqual(['f', 'a', 'b', ...result.newIds.slice(1)])
  })

  it('carries newly added contents in an isolated pasted frame', () => {
    const result = paste(scene(), ['f'])
    const separated = translateElements(result.document, result.newIds, { x: 600, y: 0 })
    const withNewContent = insertElements(separated, [shape('new', 850)])
    expect(withFrameContents(withNewContent, [result.newIds[0]!])).toEqual([
      ...result.newIds,
      'new'
    ])
    expect(buildClipboardPayload(withNewContent, [result.newIds[0]!])!.elements).toHaveLength(4)
  })

  it('keeps ordinary containment, visible text clipping and empty frames unchanged', () => {
    const document = insertElements(scene(), [
      frame('empty', 800),
      shape('crossing', 390),
      {
        id: 'text',
        type: 'text',
        x: -100,
        y: 20,
        width: 200,
        height: 30,
        text: 'clipped',
        textStyle: defaultTextStyle,
        clip: { left: 0.5, right: 0, top: 0, bottom: 0 }
      }
    ])
    expect(withFrameContents(document, ['f'])).toEqual(['f', 'a', 'b', 'text'])
    expect(withFrameContents(document, ['empty'])).toEqual(['empty'])
    expect(withFrameContents(document, ['a', 'missing'])).toEqual(['a', 'missing'])
  })

  it('isolates duplicate-drag frames too and detaches membership when only contents are copied', () => {
    let count = 0
    const result = duplicateElements(scene(), ['f', 'a', 'b'], () => `dup${++count}`, {
      x: 0,
      y: 0
    })
    expect(withFrameContents(result.document, [result.newIds[0]!])).toEqual(result.newIds)
    expect(withFrameContents(result.document, ['f'])).toEqual(['f', 'a', 'b'])
    const standalone = paste(result.document, [result.newIds[1]!], 'standalone')
    expect(standalone.document.elements[standalone.newIds[0]!]!.frameContentKey).toBeUndefined()
    expect(withFrameContents(standalone.document, ['f'])).toContain(standalone.newIds[0])
  })
})
