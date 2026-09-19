import { deflateSync, Zip, type ZipInputFile } from 'fflate'
import { createAssetStorage, type StoredAsset, type StoredResource } from './document-asset-storage'
import type { CanvasDocument, ImageAsset } from './element-types'

export const DOCUMENT_ARCHIVE_VERSION = 3
export const MAX_DOCUMENT_FILE_BYTES = 256 * 1024 * 1024
export const MAX_LEGACY_DOCUMENT_BYTES = 512 * 1024 * 1024
export const MAX_RESOURCE_BYTES = 256 * 1024 * 1024
export const MAX_MATERIALIZED_CHARACTERS = 512 * 1024 * 1024
export const MAX_ARCHIVE_ENTRIES = 65_534
const encoder = new TextEncoder()
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) {
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0)
  }
  return value >>> 0
})

export function documentResourceChecksum(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let index = 0; index < bytes.length; index++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[index]!) & 255]!
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** Omitted data reuses an asset from the last successful encode in this encoder. */
export type DocumentEncodingInput = Omit<CanvasDocument, 'assets'> & {
  assets: Record<string, Omit<ImageAsset, 'data'> & { data?: string }>
}
type CachedAsset = { source: StoredAsset['source']; characters: number }
type PackedResource = { data: Uint8Array; crc: number; size: number; compression: number }

function pack(bytes: Uint8Array, compress: boolean): PackedResource {
  return {
    data: compress ? deflateSync(bytes, { level: 3 }) : bytes,
    crc: documentResourceChecksum(bytes),
    size: bytes.length,
    compression: compress ? 8 : 0
  }
}

function archive(entries: Map<string, PackedResource>): Uint8Array<ArrayBuffer> {
  const chunks: Uint8Array[] = []
  let length = 0
  const zip = new Zip((error, chunk) => {
    if (error) {
      throw error
    }
    length += chunk.length
    if (length > MAX_DOCUMENT_FILE_BYTES) {
      throw new Error('Document exceeds file size limit')
    }
    chunks.push(chunk)
  })
  for (const [filename, { data, ...metadata }] of entries) {
    const entry: ZipInputFile = { filename, ...metadata, mtime: new Date(1980, 0, 1) }
    zip.add(entry)
    entry.ondata!(null, data, true)
  }
  zip.end()
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

/** Retains only the current document's resource bytes/recipes, never materialized asset strings. */
export function createDocumentArchiveEncoder(): (
  document: DocumentEncodingInput
) => Uint8Array<ArrayBuffer> {
  let previousAssets = new Map<string, CachedAsset>()
  let previousResources = new Map<string, StoredResource>()
  let previousPacked = new Map<string, PackedResource>()
  return (document) => {
    for (const element of Object.values(document.elements)) {
      if (element.type === 'image' && !Object.hasOwn(document.assets, element.assetId)) {
        throw new Error('Missing document image asset')
      }
    }
    const storage = createAssetStorage(new Map(previousResources))
    const currentAssets = new Map<string, CachedAsset>()
    const resources = new Set<string>()
    let materialized = 0
    const assets = Object.fromEntries(
      Object.entries(document.assets).map(([id, asset]) => {
        const { data, ...metadata } = asset
        const cached =
          data === undefined
            ? previousAssets.get(id)
            : {
                source: storage.store({ ...metadata, data }).source,
                characters: data.length
              }
        if (!cached) {
          throw new Error('Missing cached document asset')
        }
        materialized += cached.characters
        currentAssets.set(id, cached)
        resources.add(cached.source.resource)
        if (cached.source.encoding === 'svg') {
          if (cached.source.images.length > 100_000) {
            throw new Error('Document exceeds SVG reference limit')
          }
          for (const image of cached.source.images) {
            resources.add(image.resource)
          }
        }
        return [id, { ...metadata, source: cached.source }]
      })
    )
    const manifest = encoder.encode(
      JSON.stringify({ ...document, version: DOCUMENT_ARCHIVE_VERSION, assets })
    )
    let expanded = manifest.length
    for (const id of resources) {
      expanded += storage.resources.get(id)!.bytes.length
    }
    if (
      expanded > MAX_RESOURCE_BYTES ||
      materialized > MAX_MATERIALIZED_CHARACTERS ||
      resources.size + 1 > MAX_ARCHIVE_ENTRIES
    ) {
      throw new Error('Document exceeds storage limits')
    }
    const entries = new Map([['document.json', pack(manifest, true)]])
    const currentResources = new Map<string, StoredResource>()
    const currentPacked = new Map<string, PackedResource>()
    for (const id of resources) {
      const resource = storage.resources.get(id)!
      const packed = previousPacked.get(id) ?? pack(resource.bytes, resource.compress)
      currentResources.set(id, resource)
      currentPacked.set(id, packed)
      entries.set(`resources/${id}`, packed)
    }
    const bytes = archive(entries)
    previousAssets = currentAssets
    previousResources = currentResources
    previousPacked = currentPacked
    return bytes
  }
}

export function serializeDocumentArchive(document: CanvasDocument): Uint8Array<ArrayBuffer> {
  return createDocumentArchiveEncoder()(document)
}
