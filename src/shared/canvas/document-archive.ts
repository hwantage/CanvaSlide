import { Inflate } from 'fflate'
import { z } from 'zod'
import { bytesToBase64 } from './binary-data'
import { restoreStoredAsset, storedAssetSchema } from './document-asset-storage'
import { canvasDocumentSchema, DOCUMENT_VERSION, type ImageAsset } from './element-types'
import { parseDocument, repairDocumentOrder, type ParseDocumentResult } from './document-file'

import {
  DOCUMENT_ARCHIVE_VERSION,
  MAX_DOCUMENT_FILE_BYTES,
  MAX_LEGACY_DOCUMENT_BYTES,
  MAX_RESOURCE_BYTES,
  MAX_MATERIALIZED_CHARACTERS,
  MAX_ARCHIVE_ENTRIES,
  documentResourceChecksum
} from './document-archive-encoder'
export {
  DOCUMENT_ARCHIVE_VERSION,
  MAX_DOCUMENT_FILE_BYTES,
  serializeDocumentArchive
} from './document-archive-encoder'

const decoder = new TextDecoder('utf-8', { fatal: true })
const archiveSchema = canvasDocumentSchema.extend({
  version: z.literal(DOCUMENT_ARCHIVE_VERSION),
  assets: z.record(z.string(), storedAssetSchema)
})

function readArchive(bytes: Uint8Array): Map<string, Uint8Array> {
  // Require a complete, single-disk ZIP directory, including its end record.
  let end = bytes.length - 22
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  while (end >= Math.max(0, bytes.length - 65557) && view.getUint32(end, true) !== 0x06054b50) {
    end--
  }
  if (
    end < 0 ||
    end + 22 + view.getUint16(end + 20, true) !== bytes.length ||
    view.getUint16(end + 4, true) !== 0 ||
    view.getUint16(end + 6, true) !== 0 ||
    view.getUint32(end + 12, true) + view.getUint32(end + 16, true) !== end
  ) {
    throw new Error('Invalid document ZIP directory')
  }
  const count = view.getUint16(end + 10, true)
  if (view.getUint32(end, true) !== 0x06054b50 || view.getUint16(end + 8, true) !== count) {
    throw new Error('Invalid document ZIP directory')
  }
  if (count > MAX_ARCHIVE_ENTRIES) {
    throw new Error('Too many document ZIP entries')
  }
  const files = new Map<string, Uint8Array>()
  const directoryStart = view.getUint32(end + 16, true)
  let directory = directoryStart
  let total = 0
  for (let index = 0; index < count; index++) {
    if (directory + 46 > end || view.getUint32(directory, true) !== 0x02014b50) {
      throw new Error('Invalid document ZIP directory entry')
    }
    const flags = view.getUint16(directory + 8, true)
    const compression = view.getUint16(directory + 10, true)
    const crc = view.getUint32(directory + 16, true)
    const compressedSize = view.getUint32(directory + 20, true)
    const size = view.getUint32(directory + 24, true)
    const local = view.getUint32(directory + 42, true)
    const nameEnd = directory + 46 + view.getUint16(directory + 28, true)
    const next =
      nameEnd + view.getUint16(directory + 30, true) + view.getUint16(directory + 32, true)
    if (
      next > end ||
      (flags & 1) !== 0 ||
      (compression !== 0 && compression !== 8) ||
      view.getUint16(directory + 34, true) !== 0
    ) {
      throw new Error('Invalid document ZIP directory entry')
    }
    const name = decoder.decode(bytes.subarray(directory + 46, nameEnd))
    if (
      files.has(name) ||
      !(name === 'document.json' || /^resources\/[a-f0-9]{16}[a-z0-9]+(?:-\d+)?$/.test(name))
    ) {
      throw new Error('Invalid document ZIP entry')
    }
    if (size > MAX_RESOURCE_BYTES - total) {
      throw new Error('Document exceeds expanded size limit')
    }
    if (local + 30 > directoryStart || view.getUint32(local, true) !== 0x04034b50) {
      throw new Error('Invalid document ZIP local header')
    }
    const localNameEnd = local + 30 + view.getUint16(local + 26, true)
    const start = localNameEnd + view.getUint16(local + 28, true)
    if (
      start + compressedSize > directoryStart ||
      decoder.decode(bytes.subarray(local + 30, localNameEnd)) !== name ||
      view.getUint16(local + 6, true) !== flags ||
      view.getUint16(local + 8, true) !== compression ||
      ((flags & 8) === 0 &&
        (view.getUint32(local + 14, true) !== crc ||
          view.getUint32(local + 18, true) !== compressedSize ||
          view.getUint32(local + 22, true) !== size))
    ) {
      throw new Error('Invalid document ZIP local header')
    }
    let data: Uint8Array
    if (compression === 0) {
      data = bytes.subarray(start, start + compressedSize)
      total += data.length
    } else {
      const chunks: Uint8Array[] = []
      let expanded = 0
      const inflate = new Inflate((chunk) => {
        expanded += chunk.length
        total += chunk.length
        if (expanded > size || total > MAX_RESOURCE_BYTES) {
          throw new Error('Document exceeds expanded size limit')
        }
        chunks.push(chunk)
      })
      // Bound allocations even when a forged directory understates the inflated size.
      for (let offset = 0; offset < compressedSize; offset += 1024) {
        const last = Math.min(offset + 1024, compressedSize)
        inflate.push(bytes.subarray(start + offset, start + last), last === compressedSize)
      }
      data = new Uint8Array(expanded)
      let offset = 0
      for (const chunk of chunks) {
        data.set(chunk, offset)
        offset += chunk.length
      }
    }
    if (data.length !== size || documentResourceChecksum(data) !== crc) {
      throw new Error('Corrupt document ZIP entry')
    }
    files.set(name, data)
    directory = next
  }
  if (directory !== end || !files.has('document.json')) {
    throw new Error('Incomplete document archive')
  }
  return files
}

export function parseDocumentFile(bytes: Uint8Array): ParseDocumentResult {
  try {
    const legacy = bytes[0] !== 0x50 || bytes[1] !== 0x4b
    if (bytes.length > (legacy ? MAX_LEGACY_DOCUMENT_BYTES : MAX_DOCUMENT_FILE_BYTES)) {
      throw new Error('Document exceeds file size limit')
    }
    if (legacy) {
      return parseDocument(decoder.decode(bytes))
    }
    const files = readArchive(bytes)
    const stored = archiveSchema.parse(JSON.parse(decoder.decode(files.get('document.json')!)))
    let characters = 0
    const reserve = (length: number) => {
      characters += length
      if (characters > MAX_MATERIALIZED_CHARACTERS) {
        throw new Error('Document exceeds materialized size limit')
      }
    }
    const resource = (id: string): Uint8Array => {
      const data = files.get(`resources/${id}`)
      if (!data) {
        throw new Error(`Missing document resource: ${id}`)
      }
      return data
    }
    const encoded = new Map<string, string>()
    const encodedResource = (id: string): string => {
      let data = encoded.get(id)
      if (data === undefined) {
        data = bytesToBase64(resource(id))
        encoded.set(id, data)
      }
      return data
    }
    const assets: Record<string, ImageAsset> = Object.fromEntries(
      Object.entries(stored.assets).map(([id, asset]) => [
        id,
        restoreStoredAsset(asset, resource, reserve, encodedResource)
      ])
    )
    const document = canvasDocumentSchema.parse({ ...stored, version: DOCUMENT_VERSION, assets })
    for (const element of Object.values(document.elements)) {
      if (element.type === 'image' && !Object.hasOwn(assets, element.assetId)) {
        throw new Error('Missing document image asset')
      }
    }
    return { ok: true, document: repairDocumentOrder(document) }
  } catch (error) {
    return {
      ok: false,
      error: `Invalid document: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}
