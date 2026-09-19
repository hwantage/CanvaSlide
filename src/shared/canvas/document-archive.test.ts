import { describe, expect, it } from 'vitest'
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'
import { createImageAsset } from './document-assets'
import { bytesToBase64 } from './binary-data'
import { createEmptyDocument, type CanvasDocument } from './element-types'
import {
  MAX_DOCUMENT_FILE_BYTES,
  parseDocumentFile,
  serializeDocumentArchive
} from './document-archive'
import { serializeDocument } from './document-file'
import {
  buildClipboardPayload,
  parseClipboardPayload,
  pasteClipboardPayload
} from './clipboard-payload'
import { removeElements } from './document-mutations'

function scene(): CanvasDocument {
  const doc = createEmptyDocument('Shared crops')
  let seed = 42
  const bytes = Uint8Array.from({ length: 16_384 }, () => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return seed & 255
  })
  const bitmap = `data:image/png;base64,${bytesToBase64(bytes)}`
  const sources = [
    bitmap,
    ...[0, 1, 2, 3].map(
      (x) =>
        `data:image/svg+xml;base64,${bytesToBase64(strToU8(`<svg xmlns="http://www.w3.org/2000/svg"><clipPath id="crop"><rect x="${x}" width="10" height="10"/></clipPath><image clip-path="url(#crop)" href="${bitmap}"/></svg>`))}`
    )
  ]
  for (const [index, data] of sources.entries()) {
    const asset = createImageAsset(data, 10, 10)
    doc.assets[asset.id] = asset
    const id = `image-${index}`
    doc.elements[id] = {
      id,
      type: 'image',
      x: index * 10,
      y: 0,
      width: 10,
      height: 10,
      naturalWidth: 10,
      naturalHeight: 10,
      assetId: asset.id
    }
    doc.order.push(id)
  }
  return doc
}

function rewrite(
  bytes: Uint8Array,
  change: (files: Record<string, Uint8Array>) => void
): Uint8Array {
  const files = unzipSync(bytes)
  change(files)
  return zipSync(files)
}

function reopen(bytes: Uint8Array): CanvasDocument {
  const parsed = parseDocumentFile(bytes)
  if (!parsed.ok) {
    throw new Error(parsed.error)
  }
  return parsed.document
}

describe('document archive', () => {
  it('round-trips exact assets, stores each bitmap once and keeps the saving benefit after reopening', () => {
    const doc = scene()
    const archive = serializeDocumentArchive(doc)
    expect(archive.length).toBeLessThan(serializeDocument(doc).length / 5)
    const entries = unzipSync(archive)
    expect(Object.keys(entries)).toHaveLength(6)
    expect(JSON.parse(strFromU8(entries['document.json']!)).version).toBe(3)
    expect(reopen(archive)).toEqual(doc)
    const savedAgain = serializeDocumentArchive(reopen(archive))
    expect(savedAgain.length).toBeLessThan(serializeDocument(doc).length / 5)
    expect(reopen(savedAgain)).toEqual(doc)
    expect(doc).toEqual(scene())
  })

  it('opens legacy JSON v1 and v2 documents', () => {
    const doc = scene()
    expect(reopen(strToU8(serializeDocument(doc)))).toEqual(doc)
    const old = { ...createEmptyDocument(), version: 1 }
    expect(reopen(strToU8(JSON.stringify(old))).version).toBe(2)
    expect(reopen(serializeDocumentArchive(reopen(strToU8(JSON.stringify(old)))))).toEqual(
      createEmptyDocument()
    )
  })

  it('allows legacy migration input larger than the archive file budget', () => {
    const document = createEmptyDocument()
    const bytes = new Uint8Array(MAX_DOCUMENT_FILE_BYTES + 1).fill(32)
    bytes.set(strToU8(serializeDocument(document)))
    expect(parseDocumentFile(bytes)).toEqual({ ok: true, document })
  })

  it('retains nested resources until the final referencing crop is deleted', () => {
    let doc = reopen(serializeDocumentArchive(scene()))
    doc = removeElements(doc, ['image-0', 'image-1', 'image-2', 'image-3'])
    const saved = serializeDocumentArchive(doc)
    expect(Object.keys(unzipSync(saved))).toHaveLength(3)
    expect(reopen(saved)).toEqual(doc)
    doc = removeElements(doc, ['image-4'])
    expect(Object.keys(unzipSync(serializeDocumentArchive(doc)))).toEqual(['document.json'])
  })

  it('keeps images self-contained when copied into a different document and saved again', () => {
    const source = reopen(serializeDocumentArchive(scene()))
    const copied = buildClipboardPayload(source, ['image-2', 'image-3'])!
    const payload = parseClipboardPayload(JSON.stringify(copied))!
    let serial = 0
    const pasted = pasteClipboardPayload(createEmptyDocument(), payload, () => `copy-${++serial}`, {
      x: 24,
      y: 24
    }).document
    expect(Object.values(reopen(serializeDocumentArchive(pasted)).assets)).toEqual(
      Object.values(payload.assets)
    )
    expect(Object.keys(unzipSync(serializeDocumentArchive(pasted)))).toHaveLength(4)
  })

  it('rejects reference amplification before materializing the repeated bitmap', () => {
    const bad = rewrite(serializeDocumentArchive(scene()), (files) => {
      const doc = JSON.parse(strFromU8(files['document.json']!))
      const asset = Object.values(doc.assets)[1] as {
        source: { images: { offset: number; prefix: string; resource: string }[] }
      }
      asset.source.images = Array.from({ length: 30_000 }, () => ({
        ...asset.source.images[0]!,
        offset: 0
      }))
      files['document.json'] = strToU8(JSON.stringify(doc))
    })
    expect(parseDocumentFile(bad)).toMatchObject({
      ok: false,
      error: expect.stringContaining('materialized size limit')
    })
  })

  it('rejects missing resources, invalid offsets, unsupported versions and recursive source recipes', () => {
    const original = serializeDocumentArchive(scene())
    const missing = rewrite(original, (files) => {
      delete files[Object.keys(files).find((id) => id.startsWith('resources/'))!]
    })
    expect(parseDocumentFile(missing).ok).toBe(false)
    for (const mutate of [
      (doc: { version: number; assets: Record<string, { source: Record<string, unknown> }> }) => {
        doc.version = 999
      },
      (doc: { version: number; assets: Record<string, { source: Record<string, unknown> }> }) => {
        ;(Object.values(doc.assets)[1]!.source.images as { offset: number }[])[0]!.offset = -1
      },
      (doc: { version: number; assets: Record<string, { source: Record<string, unknown> }> }) => {
        Object.values(doc.assets)[0]!.source = {
          encoding: 'reference',
          asset: Object.keys(doc.assets)[0]
        }
      },
      (doc: { version: number; assets: Record<string, { source: Record<string, unknown> }> }) => {
        delete doc.assets[Object.keys(doc.assets)[0]!]
      }
    ]) {
      const bad = rewrite(original, (files) => {
        const doc = JSON.parse(strFromU8(files['document.json']!))
        mutate(doc)
        files['document.json'] = strToU8(JSON.stringify(doc))
      })
      expect(parseDocumentFile(bad).ok).toBe(false)
    }
  })

  it('rejects corrupt, truncated, oversized and unexpected ZIP entries', () => {
    const archive = serializeDocumentArchive(scene())
    expect(parseDocumentFile(archive.subarray(0, archive.length - 5)).ok).toBe(false)
    const corrupt = archive.slice()
    corrupt[60] = corrupt[60]! ^ 0xff
    expect(parseDocumentFile(corrupt).ok).toBe(false)
    expect(
      parseDocumentFile(
        rewrite(archive, (files) => {
          files['../outside'] = strToU8('bad')
        })
      ).ok
    ).toBe(false)
    // A known-size ZIP puts the declared expansion in its local header instead of a descriptor.
    const oversized = rewrite(archive, () => {})
    new DataView(oversized.buffer).setUint32(22, 0xffffffff, true)
    expect(parseDocumentFile(oversized).ok).toBe(false)
    expect(parseDocumentFile(strToU8('{bad json')).ok).toBe(false)
  })

  it('reads stored binary resources containing ZIP signatures across stream boundaries', () => {
    const document = createEmptyDocument()
    const bytes = Uint8Array.from({ length: 8197 }, (_, index) => index % 256)
    bytes.set([0x50, 0x4b, 0x07, 0x08, 0x50, 0x4b, 0x03, 0x04], 1022)
    bytes.set([0x50, 0x4b, 0x01, 0x02], 4095)
    const asset = createImageAsset(`data:image/png;base64,${bytesToBase64(bytes)}`, 10, 10)
    document.assets[asset.id] = asset
    expect(reopen(serializeDocumentArchive(document))).toEqual(document)
  })
})
