import { bytesToBase64, base64ToBytes } from './binary-data'
import { assetIdForData } from './document-assets'
import { MAX_SVG_RESOURCE_PARTS } from './element-types'
import type {
  CanvasDocument,
  DocumentFile,
  FileImageAsset,
  ImageAsset,
  ImageResource
} from './element-types'

export const MAX_DOCUMENT_BYTES = 256 * 1024 * 1024
const MAX_MATERIALIZED_CHARACTERS = 512 * 1024 * 1024
const svgPrefix = 'data:image/svg+xml;base64,'
const embeddedImage =
  /data:image\/(?!svg\+xml)[a-z0-9.+-]+(?:;[^,\s"'<>]*)?;base64,[A-Za-z0-9+/=]+/gi
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

export type DocumentEncodingInput = Omit<CanvasDocument, 'assets'> & {
  assets: Record<string, Omit<ImageAsset, 'data'> & { data?: string }>
}

type EncodedAsset = {
  resourceId: string
  resources: Record<string, ImageResource>
  materializedCharacters: number
}

function sameResource(a: ImageResource, b: ImageResource): boolean {
  if (a === b) {
    return true
  }
  if (a.type === 'data' && b.type === 'data') {
    return a.data === b.data
  }
  if (a.type !== 'svg' || b.type !== 'svg' || a.parts.length !== b.parts.length) {
    return false
  }
  return a.parts.every((part, index) => {
    const other = b.parts[index]
    return typeof part === 'string' || typeof other === 'string'
      ? part === other
      : part.resourceId === other?.resourceId
  })
}

type SharedResource = { hash: string; resource: ImageResource }

function encodeAsset(data: string, shared: Map<string, SharedResource>): EncodedAsset {
  const resources: Record<string, ImageResource> = {}
  const put = (key: string, resource: ImageResource): string => {
    let entry = shared.get(key)
    if (entry === undefined) {
      entry = { hash: assetIdForData(key), resource }
      shared.set(key, entry)
    }
    const { hash } = entry
    let id = hash
    let suffix = 0
    while (Object.hasOwn(resources, id) && !sameResource(resources[id]!, resource)) {
      id = `${hash}-${++suffix}`
    }
    resources[id] = entry.resource
    return id
  }
  let svg: string | undefined
  if (data.startsWith(svgPrefix)) {
    const encoded = data.slice(svgPrefix.length)
    try {
      const bytes = base64ToBytes(encoded)
      if (bytesToBase64(bytes) === encoded) {
        svg = decoder.decode(bytes)
      }
    } catch {
      // Non-text image payloads are stored directly without interpreting their content.
    }
  }
  if (svg === undefined) {
    return {
      resourceId: put(data, { type: 'data', data }),
      resources,
      materializedCharacters: data.length
    }
  }
  const parts: (string | { resourceId: string })[] = []
  let previous = 0
  for (const match of svg.matchAll(embeddedImage)) {
    if (parts.length + 3 > MAX_SVG_RESOURCE_PARTS) {
      throw new Error('Document exceeds SVG reference limit')
    }
    parts.push(svg.slice(previous, match.index), {
      resourceId: put(match[0], { type: 'data', data: match[0] })
    })
    previous = match.index + match[0].length
  }
  parts.push(svg.slice(previous))
  return {
    resourceId: put(JSON.stringify(parts), { type: 'svg', parts }),
    resources,
    materializedCharacters: data.length
  }
}

/** Callers omit unchanged payloads; only recipes and shared data survive between saves. */
export function createDocumentEncoder(): (document: DocumentEncodingInput) => string {
  let previous = new Map<string, EncodedAsset>()
  return (document) => {
    const current = new Map<string, EncodedAsset>()
    const resources: Record<string, ImageResource> = {}
    const assets: Record<string, FileImageAsset> = {}
    const shared = new Map<string, SharedResource>()
    const payloads = new Map<string, EncodedAsset>()
    let materializedCharacters = 0
    for (const [id, { data, ...metadata }] of Object.entries(document.assets)) {
      const entry =
        data === undefined ? previous.get(id) : (payloads.get(data) ?? encodeAsset(data, shared))
      if (!entry) {
        throw new Error(`Missing cached image asset: ${id}`)
      }
      materializedCharacters += entry.materializedCharacters
      if (materializedCharacters > MAX_MATERIALIZED_CHARACTERS) {
        throw new Error('Document exceeds materialized size limit')
      }
      current.set(id, entry)
      if (data !== undefined) {
        payloads.set(data, entry)
      }
      // Resource IDs are content hashes; verify collisions across different asset recipes too.
      for (const [resourceId, resource] of Object.entries(entry.resources)) {
        if (
          Object.hasOwn(resources, resourceId) &&
          !sameResource(resources[resourceId]!, resource)
        ) {
          throw new Error('Image resource ID collision')
        }
        resources[resourceId] = resource
      }
      assets[id] = { ...metadata, resourceId: entry.resourceId }
    }
    for (const element of Object.values(document.elements)) {
      if (element.type === 'image' && !Object.hasOwn(assets, element.assetId)) {
        throw new Error(`Missing image asset: ${element.assetId}`)
      }
    }
    const json = JSON.stringify({ ...document, assets, resources } satisfies DocumentFile, null, 2)
    if (encoder.encode(json).byteLength > MAX_DOCUMENT_BYTES) {
      throw new Error('Document exceeds file size limit')
    }
    previous = current
    return json
  }
}

/** Expands flat SVG references for the editor and HTML exporter, with a bounded output budget. */
export function resolveDocumentResources(file: DocumentFile): CanvasDocument {
  const cache = new Map<string, string>()
  const byteLengths = new Map<string, number>()
  let characters = 0
  const reserve = (length: number) => {
    characters += length
    if (characters > MAX_MATERIALIZED_CHARACTERS) {
      throw new Error('Document exceeds materialized size limit')
    }
  }
  const resource = (id: string): ImageResource => {
    if (!Object.hasOwn(file.resources, id)) {
      throw new Error(`Missing image resource: ${id}`)
    }
    return file.resources[id]!
  }
  const resolve = (id: string): string => {
    const cached = cache.get(id)
    if (cached !== undefined) {
      reserve(cached.length)
      return cached
    }
    const source = resource(id)
    if (source.type === 'data') {
      reserve(source.data.length)
      cache.set(id, source.data)
      return source.data
    }
    const parts = source.parts.map((part) => {
      if (typeof part === 'string') {
        return part
      }
      const image = resource(part.resourceId)
      if (image.type !== 'data') {
        throw new Error('SVG parts must reference a data resource')
      }
      return image.data
    })
    // Check the exact Base64 size before a small resource can expand into a large SVG.
    reserve(svgPrefix.length + 4 * Math.ceil(svgByteLength(parts, byteLengths) / 3))
    const data = svgPrefix + bytesToBase64(encoder.encode(parts.join('')))
    cache.set(id, data)
    return data
  }
  const assets = Object.fromEntries(
    Object.entries(file.assets).map(([id, asset]) => {
      if (id !== asset.id) {
        throw new Error(`Image asset ID does not match its key: ${id}`)
      }
      const { resourceId, ...metadata } = asset
      return [id, { ...metadata, data: resolve(resourceId) }]
    })
  )
  for (const [id, element] of Object.entries(file.elements)) {
    if (id !== element.id) {
      throw new Error(`Element ID does not match its key: ${id}`)
    }
    if (element.type === 'image' && !Object.hasOwn(assets, element.assetId)) {
      throw new Error(`Missing image asset: ${element.assetId}`)
    }
  }
  const { resources: _resources, ...document } = file
  return { ...document, assets }
}

function svgByteLength(parts: string[], cache: Map<string, number>): number {
  let bytes = 0
  let trailingHighSurrogate = false
  for (const part of parts) {
    if (part.length === 0) {
      continue
    }
    let length = cache.get(part)
    if (length === undefined) {
      length = encoder.encode(part).byteLength
      cache.set(part, length)
    }
    bytes += length
    const first = part.charCodeAt(0)
    if (trailingHighSurrogate && first >= 0xdc00 && first <= 0xdfff) {
      // A split surrogate pair uses four UTF-8 bytes, not two replacement characters.
      bytes -= 2
    }
    const last = part.charCodeAt(part.length - 1)
    trailingHighSurrogate = last >= 0xd800 && last <= 0xdbff
  }
  return bytes
}
