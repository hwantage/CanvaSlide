import type { CanvasDocument, CanvasElement, ConnectorEnd } from './element-types'

function equalValue(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true
  }
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
    return false
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, index) => equalValue(value, b[index]))
    )
  }
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = Object.keys(left).filter((key) => left[key] !== undefined)
  return (
    keys.length === Object.keys(right).filter((key) => right[key] !== undefined).length &&
    keys.every((key) => equalValue(left[key], right[key]))
  )
}

function endpointContent(end: ConnectorEnd): unknown {
  return end.elementId
    ? { elementId: end.elementId, pinned: !!end.pinned, side: end.pinned ? end.side : undefined }
    : end
}

function elementContent(element: CanvasElement): unknown {
  if (element.type === 'text') {
    // Text height is a renderer measurement, including after opening on a different platform.
    return { ...element, height: undefined }
  }
  if (element.type === 'connector') {
    // Bounds and attached endpoints follow their hosts, including measured text heights.
    return {
      ...element,
      x: undefined,
      y: undefined,
      width: undefined,
      height: undefined,
      start: endpointContent(element.start),
      end: endpointContent(element.end)
    }
  }
  return element
}

function sameElement(a: CanvasElement | undefined, b: CanvasElement | undefined): boolean {
  return (
    a === b ||
    (a !== undefined && b !== undefined && equalValue(elementContent(a), elementContent(b)))
  )
}

/** Compares authored content, excluding navigation and renderer measurements. */
export function createDocumentContentComparator(): (
  a: CanvasDocument,
  b: CanvasDocument
) => boolean {
  // Recheck the last differing element first so consecutive drag updates avoid a full scan.
  let differingElementId: string | undefined
  return (a, b) => {
    if (a === b) {
      return true
    }
    if (
      differingElementId !== undefined &&
      !sameElement(a.elements[differingElementId], b.elements[differingElementId])
    ) {
      return false
    }
    if (
      a.name !== b.name ||
      a.version !== b.version ||
      !equalValue(a.settings, b.settings) ||
      !equalValue(a.order, b.order) ||
      !equalValue(a.assets, b.assets)
    ) {
      return false
    }
    if (a.elements === b.elements) {
      return true
    }
    const ids = Object.keys(a.elements)
    if (ids.length !== Object.keys(b.elements).length) {
      return false
    }
    for (const id of ids) {
      if (!sameElement(a.elements[id], b.elements[id])) {
        differingElementId = id
        return false
      }
    }
    return true
  }
}
