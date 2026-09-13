import { remapConnectorHosts, translateConnector } from './connector-geometry'
import { pruneUnreferencedAssets } from './document-assets'
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
  for (const id of sources) {
    const source = document.elements[id] as CanvasElement
    let copy = translateElement({ ...source, id: idMap.get(id) as ElementId }, offset)
    if (copy.type === 'connector') {
      copy = remapConnectorHosts(copy, idMap, true)
    }
    next = insertElement(next, copy)
    newIds.push(copy.id)
  }
  return { document: next, newIds }
}

export function reorderZ(
  document: CanvasDocument,
  ids: readonly ElementId[],
  direction: 'front' | 'back'
): CanvasDocument {
  const moving = document.order.filter((id) => ids.includes(id))
  const rest = document.order.filter((id) => !ids.includes(id))
  return { ...document, order: direction === 'front' ? [...rest, ...moving] : [...moving, ...rest] }
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
