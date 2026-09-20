import { describe, expect, it } from 'vitest'
import { bytesToBase64 } from './binary-data'
import { createImageAsset } from './document-assets'
import { createEmptyDocument, type CanvasDocument, type DocumentFile } from './element-types'
import { parseDocument, parseDocumentFile, serializeDocument } from './document-file'
import { createDocumentEncoder, resolveDocumentResources } from './document-resources'

const png = 'data:image/png;base64,AQIDBA=='
const svgUrl = (svg: string) =>
  `data:image/svg+xml;base64,${bytesToBase64(new TextEncoder().encode(svg))}`

function withImages(data: string[]): CanvasDocument {
  const document = createEmptyDocument('Shared resources')
  for (const [index, url] of data.entries()) {
    const asset = createImageAsset(url, 32, 32)
    document.assets[asset.id] = asset
    const id = `image-${index}`
    document.elements[id] = {
      id,
      type: 'image',
      assetId: asset.id,
      x: index * 100,
      y: 0,
      width: 64,
      height: 64,
      naturalWidth: 32,
      naturalHeight: 32
    }
    document.order.push(id)
  }
  return document
}

describe('JSON document resources', () => {
  it('stores a shared bitmap once across editable SVG crops and standalone images', () => {
    const original = withImages([
      png,
      ...[1, 2].map((x) =>
        svgUrl(
          `<svg><text>한글 😀</text><image x="${x}" href="${png}"/><image href='${png}'/></svg>`
        )
      )
    ])
    const json = serializeDocument(original)
    const file: DocumentFile = JSON.parse(json)
    expect(file.version).toBe(1)
    expect(json.split(png)).toHaveLength(2)
    expect(Object.values(file.resources).filter((r) => r.type === 'data')).toHaveLength(1)
    expect(Object.values(file.resources).filter((r) => r.type === 'svg')).toHaveLength(2)
    expect(json).toContain('<svg><text>한글 😀</text>')
    expect(parseDocument(json)).toEqual({ ok: true, document: original })
    expect(parseDocumentFile(new TextEncoder().encode(json))).toEqual({
      ok: true,
      document: original
    })
  })

  it('accepts human-readable resource IDs and SVG text parts without hashes or byte offsets', () => {
    const file: DocumentFile = {
      ...createEmptyDocument('Written by an AI'),
      assets: {
        illustration: {
          id: 'illustration',
          mime: 'image/svg+xml',
          width: 32,
          height: 32,
          resourceId: 'drawing'
        }
      },
      resources: {
        photo: { type: 'data', data: png },
        drawing: {
          type: 'svg',
          parts: ['<svg><image href="', { resourceId: 'photo' }, '"/></svg>']
        }
      }
    }
    const parsed = parseDocument(JSON.stringify(file))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) {
      return
    }
    expect(parsed.document.assets.illustration!.data).toBe(
      svgUrl(`<svg><image href="${png}"/></svg>`)
    )
    const changed: DocumentFile = JSON.parse(serializeDocument(parsed.document))
    changed.name = 'Edited in a text editor'
    const reopened = parseDocument(JSON.stringify(changed))
    expect(reopened.ok && reopened.document.name).toBe('Edited in a text editor')
  })

  it('keeps literal text separate from references and preserves SVG Unicode', () => {
    const data = svgUrl(
      `<svg><text>resource:photo {{photo}} 한글 😀</text><image href="${png}"/></svg>`
    )
    const original = withImages([data])
    expect(parseDocument(serializeDocument(original))).toEqual({ ok: true, document: original })
  })

  it('joins SVG text parts that split a Unicode surrogate pair', () => {
    const original = withImages([svgUrl('<svg><text>한글 😀</text></svg>')])
    const file: DocumentFile = JSON.parse(serializeDocument(original))
    const id = Object.keys(file.resources)[0]!
    file.resources[id] = {
      type: 'svg',
      parts: ['<svg><text>한글 \ud83d', '', '\ude00</text></svg>']
    }
    expect(parseDocument(JSON.stringify(file))).toEqual({ ok: true, document: original })
  })

  it('can save and reopen shared SVG assets within the materialized size limit', () => {
    const file: DocumentFile = {
      ...createEmptyDocument(),
      assets: Object.fromEntries(
        Array.from({ length: 130 }, (_, index) => {
          const id = `drawing-${index}`
          return [id, { id, mime: 'image/svg+xml', width: 32, height: 32, resourceId: 'drawing' }]
        })
      ),
      resources: {
        drawing: { type: 'svg', parts: [`<svg><!--${'a'.repeat(1024 * 1024)}--></svg>`] }
      }
    }
    const parsed = parseDocument(JSON.stringify(file))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) {
      return
    }
    expect(parseDocument(serializeDocument(parsed.document))).toEqual(parsed)
  })

  it('reuses unchanged recipes, honors changed metadata, prunes removed resources and restores undo', () => {
    const encode = createDocumentEncoder()
    const document = withImages([png])
    const [id, asset] = Object.entries(document.assets)[0]!
    const first = encode(document)
    const { data: _data, ...metadata } = asset
    const second = encode({
      ...document,
      name: 'Renamed',
      assets: { [id]: { ...metadata, width: 64 } }
    })
    const reopened = parseDocument(second)
    expect(reopened.ok && reopened.document.assets[id]).toEqual({ ...asset, width: 64 })
    expect(JSON.parse(second).resources).toEqual(JSON.parse(first).resources)
    expect(JSON.parse(encode(createEmptyDocument())).resources).toEqual({})
    expect(encode(document)).toBe(first)
    expect(() => createDocumentEncoder()({ ...document, assets: { [id]: metadata } })).toThrow(
      'Missing cached image asset'
    )
  })

  it('updates an existing asset payload and releases its old resource', () => {
    const encode = createDocumentEncoder()
    const document = withImages([png])
    const [id, asset] = Object.entries(document.assets)[0]!
    const first: DocumentFile = JSON.parse(encode(document))
    const data = 'data:image/png;base64,BQYHCA=='
    const changed = { ...document, assets: { [id]: { ...asset, data } } }
    const second = encode(changed)
    expect(Object.keys(JSON.parse(second).resources)).not.toEqual(Object.keys(first.resources))
    expect(parseDocument(second)).toEqual({ ok: true, document: changed })
  })

  it('rejects missing resources, invalid asset IDs and missing image assets', () => {
    const original: DocumentFile = JSON.parse(serializeDocument(withImages([png])))
    const broken = structuredClone(original)
    broken.resources = {}
    expect(parseDocument(JSON.stringify(broken))).toMatchObject({
      ok: false,
      error: expect.stringContaining('Missing image resource')
    })
    const badId = structuredClone(original)
    Object.values(badId.assets)[0]!.id = 'different'
    expect(parseDocument(JSON.stringify(badId)).ok).toBe(false)
    const missingAsset = { ...original, assets: {} }
    expect(parseDocument(JSON.stringify(missingAsset))).toMatchObject({
      ok: false,
      error: expect.stringContaining('Missing image asset')
    })
    const badElement = structuredClone(original)
    badElement.elements['image-0']!.id = 'different'
    expect(parseDocument(JSON.stringify(badElement)).ok).toBe(false)
  })

  it('rejects cyclic SVG resources before expansion', () => {
    const file: DocumentFile = JSON.parse(serializeDocument(withImages([svgUrl('<svg/>')])))
    const id = Object.keys(file.resources)[0]!
    file.resources[id] = { type: 'svg', parts: [{ resourceId: id }] }
    expect(() => resolveDocumentResources(file)).toThrow('SVG parts must reference a data resource')
  })

  it('rejects excessive SVG references on save instead of producing a file that cannot open', () => {
    const data = svgUrl(`<svg>${`<image href="${png}"/>`.repeat(50_000)}</svg>`)
    expect(() => serializeDocument(withImages([data]))).toThrow('SVG reference limit')
  })

  it('bounds repeated SVG expansion before joining its content', () => {
    const file: DocumentFile = JSON.parse(serializeDocument(withImages([svgUrl('<svg/>')])))
    const id = Object.keys(file.resources)[0]!
    file.resources.photo = {
      type: 'data',
      data: `data:image/png;base64,${'A'.repeat(1024 * 1024)}`
    }
    file.resources[id] = {
      type: 'svg',
      parts: Array.from({ length: 385 }, () => ({ resourceId: 'photo' }))
    }
    expect(() => resolveDocumentResources(file)).toThrow('materialized size limit')
  })

  it('rejects ZIP bytes, invalid UTF-8 and removed versions', () => {
    expect(parseDocumentFile(new Uint8Array([80, 75, 3, 4])).ok).toBe(false)
    expect(parseDocumentFile(new Uint8Array([255])).ok).toBe(false)
    const file = JSON.parse(serializeDocument(createEmptyDocument()))
    for (const version of [2, 3]) {
      expect(parseDocument(JSON.stringify({ ...file, version })).ok).toBe(false)
    }
  })
})
