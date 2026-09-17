import { remapConnectorHosts, translateConnector } from './connector-geometry'
import { pruneUnreferencedAssets } from './document-assets'
import { remapGroupIds } from './element-groups'
import { selectionIsOnlyFrames } from './frame-from-selection'
import type { CanvasDocument, CanvasElement, ElementId, Point } from './element-types'

/** Pure document transforms; every function returns a new document and never mutates. */

export function insertElement(document: CanvasDocument, element: CanvasElement): CanvasDocument {
  return {
    ...document,
    elements: { ...document.elements, [element.id]: element },
    order: [...document.order.filter((id) => id !== element.id), element.id]
  }
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

export function duplicateElements(
  document: CanvasDocument,
  ids: readonly ElementId[],
  makeId: () => ElementId,
  offset: Point = { x: 24, y: 24 }
): { document: CanvasDocument; newIds: ElementId[] } {
  let next = document
  const newIds: ElementId[] = []
  // Why: iterate in z-order so duplicates keep their relative stacking; ids are assigned first
  // so connectors can be re-pointed at duplicated hosts.
  const sources = document.order.filter((id) => ids.includes(id) && document.elements[id])
  const idMap = new Map(sources.map((id) => [id, makeId()] as const))
  const copies: CanvasElement[] = []
  for (const id of sources) {
    const source = document.elements[id] as CanvasElement
    let copy = translateElement({ ...source, id: idMap.get(id) as ElementId }, offset)
    if (copy.type === 'connector') {
      copy = remapConnectorHosts(copy, idMap, true)
    }
    copies.push(copy)
  }
  // Why: a duplicated group must stay grouped, but as its own group.
  for (const copy of remapGroupIds(copies, makeId)) {
    next = insertElement(next, copy)
    newIds.push(copy.id)
  }
  return { document: next, newIds }
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
