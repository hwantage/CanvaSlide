import { z } from 'zod'
import { upsertAsset } from './document-assets'
import { cloneElements } from './document-mutations'
import { withFrameContents } from './element-bounds'
import {
  canvasElementSchema,
  imageAssetSchema,
  type CanvasDocument,
  type CanvasElement,
  type ElementId,
  type ImageAsset,
  type Point
} from './element-types'

export const CLIPBOARD_KIND = 'canvaslide/clipboard'

export const clipboardPayloadSchema = z.object({
  kind: z.literal(CLIPBOARD_KIND),
  version: z.literal(1),
  elements: z.array(canvasElementSchema).min(1),
  assets: z.record(z.string(), imageAssetSchema)
})
export type ClipboardPayload = z.infer<typeof clipboardPayloadSchema>

export function clipboardPayloadKey(payload: ClipboardPayload): string {
  // Parsing and in-memory copies can have different property order for the same contents.
  return JSON.stringify(payload, (_key, value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
    }
    return value
  })
}

/** Selected elements and frame contents in z-order, with their referenced image assets. */
export function buildClipboardPayload(
  document: CanvasDocument,
  ids: readonly ElementId[]
): ClipboardPayload | null {
  const wanted = new Set(withFrameContents(document, ids))
  const elements: CanvasElement[] = []
  const assets: Record<string, ImageAsset> = {}
  for (const id of document.order) {
    const element = document.elements[id]
    if (!element || !wanted.has(id)) {
      continue
    }
    elements.push(element)
    if (element.type === 'image') {
      const asset = document.assets[element.assetId]
      if (asset) {
        assets[asset.id] = asset
      }
    }
  }
  return elements.length === 0 ? null : { kind: CLIPBOARD_KIND, version: 1, elements, assets }
}

export function parseClipboardPayload(text: string | null | undefined): ClipboardPayload | null {
  if (!text || !text.includes(CLIPBOARD_KIND)) {
    return null
  }
  try {
    const result = clipboardPayloadSchema.safeParse(JSON.parse(text))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

/** Inserts a payload with fresh ids and an offset; frames get appended order numbers. */
export function pasteClipboardPayload(
  document: CanvasDocument,
  payload: ClipboardPayload,
  makeId: () => ElementId,
  offset: Point
): { document: CanvasDocument; newIds: ElementId[] } {
  const withAssets = Object.values(payload.assets).reduce(upsertAsset, document)
  // Why: hosts that were not copied along may not exist here, so their ends become free points.
  return cloneElements(withAssets, payload.elements, makeId, {
    offset,
    keepMissingHosts: false,
    renumberFrames: true,
    skipMissingAssets: true
  })
}
