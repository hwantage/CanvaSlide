import { remapConnectorHosts, translateConnector } from './connector-geometry'
import { pruneUnreferencedAssets } from './document-assets'
import { remapGroupIds } from './element-groups'
import { remapFrameContents } from './frame-contents'
import { selectionIsOnlyFrames } from './frame-from-selection'
import { nextFrameOrder } from './presentation-sequence'
import {
  isFrameElement,
  type CanvasDocument,
  type CanvasElement,
  type ElementId,
  type ImageAsset,
  type Point
} from './element-types'

/** Pure document transforms; every function returns a new document and never mutates. */

export function insertElement(document: CanvasDocument, element: CanvasElement): CanvasDocument {
  return {
    ...document,
    elements: { ...document.elements, [element.id]: element },
    order: [...document.order.filter((id) => id !== element.id), element.id]
  }
}

/** Copy the document tables once for imports, pastes and duplicates with many layers. */
export function insertElements(
  document: CanvasDocument,
  incoming: readonly CanvasElement[],
  assets: readonly ImageAsset[] = []
): CanvasDocument {
  if (incoming.length === 0 && assets.length === 0) {
    return document
  }
  const nextAssets = { ...document.assets }
  for (const asset of assets) {
    nextAssets[asset.id] ??= asset
  }
  const elements = { ...document.elements }
  const lastIndex = new Map(incoming.map((element, index) => [element.id, index]))
  const order = document.order.filter((id) => !lastIndex.has(id))
  for (const [index, element] of incoming.entries()) {
    elements[element.id] = element
    if (lastIndex.get(element.id) === index) {
      order.push(element.id)
    }
  }
  return { ...document, assets: nextAssets, elements, order }
}

export function removeElements(
  document: CanvasDocument,
  ids: readonly ElementId[]
): CanvasDocument {
  const removed = new Set(ids)
  const elements = { ...document.elements }
  for (const id of removed) {
    delete elements[id]
  }
  return pruneUnreferencedAssets({
    ...document,
    elements,
    order: document.order.filter((id) => !removed.has(id))
  })
}

export type ElementPatch<T extends CanvasElement = CanvasElement> =
  | Partial<T>
  | ((element: T) => Partial<T>)

export function patchElements(
  document: CanvasDocument,
  ids: readonly ElementId[],
  patch: ElementPatch
): CanvasDocument {
  const elements = { ...document.elements }
  let changed = false
  for (const id of ids) {
    const current = elements[id]
    if (!current) {
      continue
    }
    const partial = typeof patch === 'function' ? patch(current) : patch
    // Why: discriminated unions can't be spread generically without widening; the cast is local.
    elements[id] = { ...current, ...partial } as CanvasElement
    changed = true
  }
  return changed ? { ...document, elements } : document
}

export function translateElement(element: CanvasElement, delta: Point): CanvasElement {
  if (element.type === 'connector') {
    return translateConnector(element, delta)
  }
  return { ...element, x: element.x + delta.x, y: element.y + delta.y }
}

export function translateElements(
  document: CanvasDocument,
  ids: readonly ElementId[],
  delta: Point
): CanvasDocument {
  return patchElements(document, ids, (element) => translateElement(element, delta))
}

/** How copies of elements land in the document; duplicating and pasting differ only here. */
export type CloneOptions = {
  offset: Point
  /** Keep uncopied hosts for duplicate; detach them for paste into another document. */
  keepMissingHosts: boolean
  /** Copied frames take fresh deck positions after the last frame instead of their source's. */
  renumberFrames: boolean
  /** Paste skips images without assets; duplication preserves every existing element. */
  skipMissingAssets?: boolean
}

export function cloneElements(
  document: CanvasDocument,
  sources: readonly CanvasElement[],
  makeId: () => ElementId,
  options: CloneOptions
): { document: CanvasDocument; newIds: ElementId[] } {
  const cloneable = sources.filter(
    (source) =>
      !options.skipMissingAssets || source.type !== 'image' || document.assets[source.assetId]
  )
  // Why: all copied IDs must exist before connectors and groups can be remapped.
  const idMap = new Map(cloneable.map((source) => [source.id, makeId()] as const))
  const copies: CanvasElement[] = []
  const newIds: ElementId[] = []
  for (const source of remapGroupIds(remapFrameContents(cloneable, idMap), makeId)) {
    let copy: CanvasElement = { ...source, id: idMap.get(source.id) as ElementId }
    // Why: translating skips attached ends, so detach missing hosts before applying the offset.
    if (copy.type === 'connector') {
      copy = remapConnectorHosts(copy, idMap, options.keepMissingHosts)
    }
    copy = translateElement(copy, options.offset)
    copies.push(copy)
    newIds.push(copy.id)
  }
  if (options.renumberFrames) {
    // Slide order is independent of the clipboard's paint order.
    const frames = copies.filter(isFrameElement).sort((a, b) => a.order - b.order)
    const firstOrder = nextFrameOrder(document)
    for (const [index, frame] of frames.entries()) {
      frame.order = firstOrder + index
    }
  }
  return { document: insertElements(document, copies), newIds }
}

/** Copies of `ids` in z-order, a step down-right, still attached to hosts that stayed behind. */
export function duplicateElements(
  document: CanvasDocument,
  ids: readonly ElementId[],
  makeId: () => ElementId,
  offset: Point = { x: 24, y: 24 }
): { document: CanvasDocument; newIds: ElementId[] } {
  const wanted = new Set(ids)
  const sources = document.order.flatMap((id) => {
    const element = document.elements[id]
    return element && wanted.has(id) ? [element] : []
  })
  return cloneElements(document, sources, makeId, {
    offset,
    keepMissingHosts: true,
    renumberFrames: false
  })
}

export type ZDirection = 'front' | 'back' | 'forward' | 'backward'

export function reorderZ(
  document: CanvasDocument,
  ids: readonly ElementId[],
  direction: ZDirection
): CanvasDocument {
  // Why: frames are always painted beneath content and carry the deck order, not the paint order,
  // so restacking a frames-only selection changes nothing anyone can see. Refusing here covers the
  // ] and [ shortcuts too, which never learned what the panel and the context menu already hide.
  if (selectionIsOnlyFrames(document, ids)) {
    return document
  }
  if (direction === 'forward' || direction === 'backward') {
    return stepZ(document, ids, direction)
  }
  const moving = document.order.filter((id) => ids.includes(id))
  const rest = document.order.filter((id) => !ids.includes(id))
  return { ...document, order: direction === 'front' ? [...rest, ...moving] : [...moving, ...rest] }
}

/**
 * Moves the selection one step past its nearest unselected neighbour, keeping the selection's own
 * relative order. Contiguous selected runs move together so nothing leapfrogs inside the group.
 */
function stepZ(
  document: CanvasDocument,
  ids: readonly ElementId[],
  direction: 'forward' | 'backward'
): CanvasDocument {
  const selected = new Set(ids)
  const order = [...document.order]
  const toward = direction === 'forward' ? 1 : -1
  const edge = direction === 'forward' ? order.length - 1 : 0
  // Why: walking from the destination edge, a selected item swaps with the unselected one ahead
  // of it; items already packed against the edge (or behind another selected item) stay put.
  let blocked = edge
  for (let i = edge; i >= 0 && i < order.length; i -= toward) {
    const id = order[i] as ElementId
    if (!selected.has(id)) {
      continue
    }
    if (i === blocked) {
      blocked -= toward
      continue
    }
    const ahead = order[i + toward] as ElementId
    if (selected.has(ahead)) {
      continue
    }
    order[i + toward] = id
    order[i] = ahead
  }
  return order.every((id, i) => id === document.order[i]) ? document : { ...document, order }
}

export function applyFrameOrders(
  document: CanvasDocument,
  orders: Record<ElementId, number>
): CanvasDocument {
  const ids = Object.keys(orders)
  return patchElements(document, ids, (element) =>
    element.type === 'frame' ? { order: orders[element.id] ?? element.order } : {}
  )
}
