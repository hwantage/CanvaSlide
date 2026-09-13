import { z } from 'zod'
import { remapConnectorHosts } from './connector-geometry'
import { upsertAsset } from './document-assets'
import { translateElement } from './document-mutations'
import { insertElement } from './document-mutations'
import {
  canvasElementSchema,
  imageAssetSchema,
  type CanvasDocument,
  type CanvasElement,
  type ElementId,
  type ImageAsset,
  type Point
} from './element-types'
import { nextFrameOrder } from './presentation-sequence'

export const CLIPBOARD_KIND = 'canvaslide/clipboard'

export const clipboardPayloadSchema = z.object({
  kind: z.literal(CLIPBOARD_KIND),
  version: z.literal(1),
  elements: z.array(canvasElementSchema).min(1),
  assets: z.record(z.string(), imageAssetSchema)
})
export type ClipboardPayload = z.infer<typeof clipboardPayloadSchema>

/** Selected elements in z-order plus the image assets they reference. */
export function buildClipboardPayload(
  document: CanvasDocument,
  ids: readonly ElementId[]
): ClipboardPayload | null {
  const wanted = new Set(ids)
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
  let next = document
  for (const asset of Object.values(payload.assets)) {
    next = upsertAsset(next, asset)
  }
  const newIds: ElementId[] = []
  let frameOrder = nextFrameOrder(next)
  const idMap = new Map(payload.elements.map((element) => [element.id, makeId()] as const))
  for (const source of payload.elements) {
    let copy: CanvasElement = { ...source, id: idMap.get(source.id) as ElementId }
    // Why: detach before translating; translate skips attached ends, so a detached-after end would
    // stay at its original coordinates.
    if (copy.type === 'connector') {
      copy = remapConnectorHosts(copy, idMap, false)
    }
    const base = translateElement(copy, offset)
    const element: CanvasElement =
      base.type === 'frame' ? { ...base, order: (frameOrder += 1) - 1 } : base
    if (element.type === 'image' && !next.assets[element.assetId]) {
      continue
    }
    next = insertElement(next, element)
    newIds.push(element.id)
  }
  return { document: next, newIds }
}
