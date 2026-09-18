import { describe, expect, it } from 'vitest'
import {
  buildClipboardPayload,
  clipboardPayloadKey,
  parseClipboardPayload,
  pasteClipboardPayload
} from './clipboard-payload'
import { syncConnectorGeometry } from './connector-geometry'
import { createImageAsset, upsertAsset } from './document-assets'
import { insertElement, insertElements } from './document-mutations'
import { createEmptyDocument, type CanvasDocument, type FrameElement } from './element-types'
import { orderedFrames } from './presentation-sequence'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk'

function sample(): CanvasDocument {
  const asset = createImageAsset(PNG, 1, 1)
  let doc = upsertAsset(createEmptyDocument(), asset)
  doc = insertElement(doc, {
    id: 'f',
    type: 'frame',
    name: 'F',
    order: 1,
    x: 0,
    y: 0,
    width: 500,
    height: 500
  })
  doc = insertElement(doc, {
    id: 'i',
    type: 'image',
    assetId: asset.id,
    naturalWidth: 1,
    naturalHeight: 1,
    x: 10,
    y: 10,
    width: 5,
    height: 5
  })
  doc = insertElement(doc, {
    id: 't',
    type: 'text',
    text: 'hi',
    x: 20,
    y: 20,
    width: 50,
    height: 20,
    textStyle: { color: '#000', fontSize: 12, align: 'left', bold: false }
  })
  return doc
}

describe('clipboard-payload', () => {
  it('copies frame contents and image assets once, excluding objects crossing the frame edge', () => {
    let doc = sample()
    doc = insertElement(doc, { ...doc.elements.t!, id: 'crossing', x: 490 })
    doc = insertElement(doc, { ...doc.elements.t!, id: 'outside', x: 600 })
    const payload = buildClipboardPayload(doc, ['f', 't'])!
    expect(payload.elements.map((element) => element.id)).toEqual(['f', 'i', 't'])
    expect(payload.assets).toEqual(doc.assets)
    expect(buildClipboardPayload(doc, ['t'])!.elements.map((element) => element.id)).toEqual(['t'])
  })

  it('deduplicates contents shared by multiple selected frames and keeps their stacking order', () => {
    const doc = insertElement(sample(), {
      id: 'f2',
      type: 'frame',
      name: 'Second',
      order: 2,
      x: 0,
      y: 0,
      width: 100,
      height: 100
    })
    expect(buildClipboardPayload(doc, ['f', 'f2'])!.elements.map((element) => element.id)).toEqual([
      'f',
      'i',
      't',
      'f2'
    ])
  })

  it('identifies the same contents across parsing and object property order', () => {
    const payload = buildClipboardPayload(sample(), ['f', 'i', 't'])!
    const parsed = parseClipboardPayload(JSON.stringify(payload))!
    expect(clipboardPayloadKey(parsed)).toBe(clipboardPayloadKey(payload))
    const reordered = {
      ...payload,
      elements: payload.elements.map((element) =>
        Object.fromEntries(Object.entries(element).sort(([a], [b]) => b.localeCompare(a)))
      )
    } as typeof payload
    expect(clipboardPayloadKey(reordered)).toBe(clipboardPayloadKey(payload))
  })

  it('distinguishes edited contents, asset data and stacking order with unchanged ids', () => {
    const payload = buildClipboardPayload(sample(), ['i', 't'])!
    const key = clipboardPayloadKey(payload)
    const edited = structuredClone(payload)
    edited.elements[1]!.x += 1
    expect(clipboardPayloadKey(edited)).not.toBe(key)
    const newImage = structuredClone(payload)
    Object.values(newImage.assets)[0]!.data += 'different'
    expect(clipboardPayloadKey(newImage)).not.toBe(key)
    const reordered = { ...payload, elements: [payload.elements[1]!, payload.elements[0]!] }
    expect(clipboardPayloadKey(reordered)).not.toBe(key)
  })

  it('serializes selection in z-order with referenced assets and round-trips', () => {
    const doc = sample()
    const payload = buildClipboardPayload(doc, ['t', 'i'])
    expect(payload?.elements.map((e) => e.id)).toEqual(['i', 't'])
    expect(Object.keys(payload?.assets ?? {})).toHaveLength(1)
    expect(parseClipboardPayload(JSON.stringify(payload))).toEqual(payload)
    expect(parseClipboardPayload('hello')).toBeNull()
    expect(parseClipboardPayload('{"kind":"canvaslide/clipboard"}')).toBeNull()
    expect(buildClipboardPayload(doc, ['nope'])).toBeNull()
  })

  it('pastes with fresh ids, offset, appended frame order and shared assets', () => {
    const doc = sample()
    const payload = buildClipboardPayload(doc, ['f', 'i', 't'])
    if (!payload) {
      throw new Error('payload')
    }
    let n = 0
    const { document, newIds } = pasteClipboardPayload(doc, payload, () => `n${(n += 1)}`, {
      x: 24,
      y: 24
    })
    expect(newIds).toEqual(['n1', 'n2', 'n3'])
    expect(document.elements.n1).toMatchObject({ type: 'frame', order: 2, x: 24 })
    expect(document.elements.n3).toMatchObject({ type: 'text', x: 44, y: 44 })
    expect(Object.keys(document.assets)).toHaveLength(1)
    expect(document.order).toEqual(['f', 'i', 't', 'n1', 'n2', 'n3'])
  })

  it('accepts a payload pasted into another empty document (assets travel along)', () => {
    const payload = buildClipboardPayload(sample(), ['i'])
    if (!payload) {
      throw new Error('payload')
    }
    const { document } = pasteClipboardPayload(createEmptyDocument(), payload, () => 'x', {
      x: 0,
      y: 0
    })
    expect(Object.keys(document.assets)).toHaveLength(1)
    expect(document.elements.x?.type).toBe('image')
  })

  it.each([
    [3, 2, 1],
    [30, 10, 20],
    [2, 1, 1]
  ])('numbers pasted frames in slide order while retaining paint order (%j)', (...orders) => {
    const frames: FrameElement[] = orders.map((order, index) => ({
      id: `f${index}`,
      type: 'frame',
      name: `Slide ${index}`,
      order,
      x: index * 600,
      y: 0,
      width: 500,
      height: 500
    }))
    const source = insertElements(sample(), frames)
    const payload = buildClipboardPayload(source, [...source.order])!
    const original = structuredClone(source)
    const beforePayload = structuredClone(payload)
    const destination = insertElements(createEmptyDocument(), [
      { ...frames[0]!, id: 'existing', order: 50 }
    ])
    let n = 0
    const result = pasteClipboardPayload(destination, payload, () => `copy${++n}`, { x: 24, y: 24 })
    const copies = result.newIds.map((id) => result.document.elements[id]!)
    const copyFor = new Map(payload.elements.map((element, index) => [element.id, copies[index]!]))
    expect(
      orderedFrames(result.document)
        .slice(1)
        .map((frame) => [frame.id, frame.order])
    ).toEqual(orderedFrames(source).map((frame, index) => [copyFor.get(frame.id)!.id, 51 + index]))
    expect(copies.map((element) => element.type)).toEqual(
      payload.elements.map((element) => element.type)
    )
    expect(copies.map((element) => element.x)).toEqual(
      payload.elements.map((element) => element.x + 24)
    )
    expect(result.document.order).toEqual(['existing', ...result.newIds])
    expect(source).toEqual(original)
    expect(payload).toEqual(beforePayload)
    expect(result.document.elements.existing).toBe(destination.elements.existing)
  })

  it('still skips pasted images when their assets did not travel along', () => {
    const payload = buildClipboardPayload({ ...sample(), assets: {} }, ['i', 't'])!
    let n = 0
    const { document, newIds } = pasteClipboardPayload(
      createEmptyDocument(),
      payload,
      () => `copy${++n}`,
      { x: 24, y: 24 }
    )
    expect(newIds).toHaveLength(1)
    expect(document.order).toEqual(newIds)
    expect(document.elements[newIds[0]!]).toMatchObject({ type: 'text', text: 'hi', x: 44, y: 44 })
  })
})

describe('pasting connectors', () => {
  it('detaches and offsets endpoints whose copied image was skipped for a missing asset', () => {
    const doc = syncConnectorGeometry(
      insertElement(
        { ...sample(), assets: {} },
        {
          id: 'c',
          type: 'connector',
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          start: { x: 0, y: 0, elementId: 'i', side: 'right', pinned: true },
          end: { x: 100, y: 50 },
          route: 'straight',
          startHead: 'none',
          endHead: 'arrow',
          style: { stroke: '#000', strokeWidth: 2, dashed: false },
          label: '',
          textStyle: { color: '#000', fontSize: 12, align: 'center', bold: false }
        }
      )
    )
    const payload = buildClipboardPayload(doc, ['i', 'c'])!
    let n = 0
    const { document, newIds } = pasteClipboardPayload(
      createEmptyDocument(),
      payload,
      () => `copy${++n}`,
      { x: 24, y: 24 }
    )
    expect(newIds).toHaveLength(1)
    const pasted = document.elements[newIds[0]!]
    expect(pasted).toMatchObject({
      type: 'connector',
      start: { x: 39, y: 36.5 },
      end: { x: 124, y: 74 }
    })
    if (pasted?.type !== 'connector') {
      throw new Error('connector')
    }
    expect(pasted.start.elementId).toBeUndefined()
    expect(pasted.start.side).toBeUndefined()
    expect(pasted.start.pinned).toBeUndefined()
  })

  it('moves the free ends of a connector pasted without its host by the paste offset', () => {
    let doc = insertElement(createEmptyDocument(), {
      id: 's',
      type: 'shape',
      shape: 'rectangle',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      style: { fill: '#fff', stroke: '#000', strokeWidth: 1, cornerRadius: 0 },
      text: '',
      textStyle: { color: '#000', fontSize: 12, align: 'left', bold: false }
    })
    doc = syncConnectorGeometry(
      insertElement(doc, {
        id: 'c',
        type: 'connector',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        route: 'straight',
        startHead: 'none',
        endHead: 'arrow',
        style: { stroke: '#000', strokeWidth: 2, dashed: false },
        label: '',
        textStyle: { color: '#000', fontSize: 12, align: 'center', bold: false },
        start: { x: 0, y: 0, elementId: 's', side: 'right', pinned: true },
        end: { x: 300, y: 50 }
      })
    )
    const payload = buildClipboardPayload(doc, ['c'])
    if (!payload) {
      throw new Error('payload')
    }
    const { document } = pasteClipboardPayload(doc, payload, () => 'p', { x: 24, y: 24 })
    const pasted = document.elements.p
    if (pasted?.type !== 'connector') {
      throw new Error('connector')
    }
    expect(pasted.start.elementId).toBeUndefined()
    expect(pasted.start).toMatchObject({ x: 100 + 24, y: 50 + 24 })
    expect(pasted.end).toMatchObject({ x: 324, y: 74 })
  })
})
