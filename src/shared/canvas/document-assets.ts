import type {
  AssetId,
  CanvasDocument,
  CanvasDocumentV1,
  CanvasElement,
  ImageAsset
} from './element-types'
import { DOCUMENT_VERSION } from './element-types'

/**
 * Content-addressed image assets: the id is a hash of the data URL, so pasting the same image
 * twice (or duplicating an element) stores the bytes once. Pure, sync, no crypto dependency.
 */

function fnv1a32(input: string, seed: number): number {
  let hash = seed >>> 0
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/** 64 bits of FNV-1a (two seeds) plus the length; collisions are negligible for a document. */
export function assetIdForData(data: string): AssetId {
  const a = fnv1a32(data, 0x811c9dc5).toString(16).padStart(8, '0')
  const b = fnv1a32(data, 0x9747b28c).toString(16).padStart(8, '0')
  return `${a}${b}${data.length.toString(36)}`
}

export function mimeOfDataUrl(data: string): string {
  const match = /^data:([^;,]+)[;,]/.exec(data)
  return match?.[1] ?? 'application/octet-stream'
}

export function createImageAsset(data: string, width: number, height: number): ImageAsset {
  return { id: assetIdForData(data), mime: mimeOfDataUrl(data), data, width, height }
}

export function upsertAsset(document: CanvasDocument, asset: ImageAsset): CanvasDocument {
  if (document.assets[asset.id]) {
    return document
  }
  return { ...document, assets: { ...document.assets, [asset.id]: asset } }
}

export function referencedAssetIds(document: CanvasDocument): Set<AssetId> {
  const ids = new Set<AssetId>()
  for (const element of Object.values(document.elements)) {
    if (element.type === 'image') {
      ids.add(element.assetId)
    }
  }
  return ids
}

/** Drops assets no element references any more. */
export function pruneUnreferencedAssets(document: CanvasDocument): CanvasDocument {
  const referenced = referencedAssetIds(document)
  const kept: Record<AssetId, ImageAsset> = {}
  let changed = false
  for (const [id, asset] of Object.entries(document.assets)) {
    if (referenced.has(id)) {
      kept[id] = asset
    } else {
      changed = true
    }
  }
  return changed ? { ...document, assets: kept } : document
}

/** Sum of asset payload bytes as stored (base64 text length ≈ file bytes). */
export function assetsByteLength(document: CanvasDocument): number {
  let total = 0
  for (const asset of Object.values(document.assets)) {
    total += asset.data.length
  }
  return total
}

/** v1 → v2: hoist inline image data into the shared asset table. */
export function migrateDocumentV1(legacy: CanvasDocumentV1): CanvasDocument {
  let document: CanvasDocument = {
    version: DOCUMENT_VERSION,
    name: legacy.name,
    elements: {},
    order: legacy.order,
    settings: legacy.settings,
    assets: {},
    ...(legacy.camera ? { camera: legacy.camera } : {})
  }
  const elements: Record<string, CanvasElement> = {}
  for (const [id, element] of Object.entries(legacy.elements)) {
    if (element.type !== 'image') {
      elements[id] = element
      continue
    }
    const { src, ...rest } = element
    const asset = createImageAsset(src, element.naturalWidth, element.naturalHeight)
    document = upsertAsset(document, asset)
    elements[id] = { ...rest, assetId: asset.id }
  }
  return { ...document, elements }
}
