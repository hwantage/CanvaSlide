import { describe, expect, it } from 'vitest'
import {
  documentFileName,
  documentNameFromPath,
  parseDocument,
  repairDocumentOrder,
  serializeDocument
} from './document-file'
import { createEmptyDocument, defaultShapeStyle, defaultTextStyle } from './element-types'

describe('document-file', () => {
  it('round-trips a document through JSON', () => {
    const doc = createEmptyDocument('Deck')
    doc.elements.a = {
      id: 'a',
      type: 'shape',
      shape: 'ellipse',
      x: 1,
      y: 2,
      width: 3,
      height: 4,
      style: defaultShapeStyle,
      text: 'hi',
      textStyle: defaultTextStyle
    }
    doc.order.push('a')
    const parsed = parseDocument(serializeDocument(doc))
    expect(parsed).toEqual({ ok: true, document: doc })
  })

  it('rejects malformed JSON and invalid shapes with a readable error', () => {
    expect(parseDocument('{nope')).toMatchObject({ ok: false })
    const bad = parseDocument(JSON.stringify({ version: 1, name: 'x', elements: {}, order: [] }))
    expect(bad.ok).toBe(false)
    if (!bad.ok) {
      expect(bad.error).toContain('settings')
    }
  })

  it('opens v1 files by migrating them to v2', () => {
    const v1 = {
      version: 1,
      name: 'legacy',
      elements: {
        img: {
          id: 'img',
          type: 'image',
          src: 'data:image/png;base64,AAAA',
          naturalWidth: 2,
          naturalHeight: 2,
          x: 0,
          y: 0,
          width: 2,
          height: 2
        }
      },
      order: ['img'],
      settings: { transitionMs: 300 }
    }
    const parsed = parseDocument(JSON.stringify(v1))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.document.version).toBe(2)
      expect(Object.keys(parsed.document.assets)).toHaveLength(1)
    }
    expect(parseDocument(JSON.stringify({ ...v1, elements: { img: { id: 'img' } } })).ok).toBe(
      false
    )
  })

  it('fills in defaults for settings older files do not have', () => {
    const doc = createEmptyDocument('d')
    const json = JSON.parse(serializeDocument(doc)) as { settings: Record<string, unknown> }
    json.settings = { transitionMs: 700 }
    const parsed = parseDocument(JSON.stringify(json))
    expect(parsed.ok && parsed.document.settings).toEqual({
      transitionMs: 700,
      background: 'dots',
      frameBorder: 'solid'
    })
  })

  it('repairs a broken order list', () => {
    const doc = createEmptyDocument()
    doc.elements.a = {
      id: 'a',
      type: 'frame',
      name: 'A',
      order: 1,
      x: 0,
      y: 0,
      width: 1,
      height: 1
    }
    doc.elements.b = {
      id: 'b',
      type: 'frame',
      name: 'B',
      order: 2,
      x: 0,
      y: 0,
      width: 1,
      height: 1
    }
    doc.order = ['b', 'ghost', 'b']
    expect(repairDocumentOrder(doc).order).toEqual(['b', 'a'])
  })

  it('derives file names', () => {
    expect(documentFileName(createEmptyDocument('  '))).toBe('Untitled.canvas.json')
    expect(documentNameFromPath('C:\\docs\\Deck.canvas.json')).toBe('Deck')
    expect(documentNameFromPath('/tmp/plan.CANVAS.JSON')).toBe('plan')
  })
})
