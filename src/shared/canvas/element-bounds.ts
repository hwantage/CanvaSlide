import { connectorDistance, connectorObstacles } from './connector-geometry'
import type { CanvasDocument, CanvasElement, ElementId, Point, Rect } from './element-types'

export function elementRect(element: CanvasElement): Rect {
  return { x: element.x, y: element.y, width: element.width, height: element.height }
}

/** Rect from two arbitrary corners (drag boxes can have negative extents). */
export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y)
  }
}

export function rectContainsPoint(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

export function rectContainsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

export function unionRects(rects: readonly Rect[]): Rect | null {
  const first = rects[0]
  if (!first) {
    return null
  }
  let minX = first.x
  let minY = first.y
  let maxX = first.x + first.width
  let maxY = first.y + first.height
  for (const r of rects) {
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.width)
    maxY = Math.max(maxY, r.y + r.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function selectionBounds(document: CanvasDocument, ids: readonly ElementId[]): Rect | null {
  const rects: Rect[] = []
  for (const id of ids) {
    const element = document.elements[id]
    if (element) {
      rects.push(elementRect(element))
    }
  }
  return unionRects(rects)
}

export function contentBounds(document: CanvasDocument): Rect | null {
  return unionRects(Object.values(document.elements).map(elementRect))
}

/** World-unit sizes of the frame's grabbable chrome (screen px ÷ zoom). */
export type FrameHitChrome = { titleHeight: number; borderWidth: number; lineWidth?: number }

/** True on the frame's title strip or within `borderWidth` of its outline. */
export function frameChromeContainsPoint(
  frame: Rect,
  point: Point,
  chrome: FrameHitChrome
): boolean {
  const titleStrip: Rect = {
    x: frame.x,
    y: frame.y - chrome.titleHeight,
    width: frame.width,
    height: chrome.titleHeight
  }
  if (rectContainsPoint(titleStrip, point)) {
    return true
  }
  const half = chrome.borderWidth / 2
  const outer: Rect = {
    x: frame.x - half,
    y: frame.y - half,
    width: frame.width + chrome.borderWidth,
    height: frame.height + chrome.borderWidth
  }
  const inner: Rect = {
    x: frame.x + half,
    y: frame.y + half,
    width: Math.max(0, frame.width - chrome.borderWidth),
    height: Math.max(0, frame.height - chrome.borderWidth)
  }
  return rectContainsPoint(outer, point) && !rectContainsPoint(inner, point)
}

/** Topmost element under `point`; frames only hit on their chrome so content stays clickable. */
export function hitTestTopmost(
  document: CanvasDocument,
  point: Point,
  frameChrome: FrameHitChrome
): CanvasElement | null {
  for (let i = document.order.length - 1; i >= 0; i -= 1) {
    const id = document.order[i]
    const element = id === undefined ? undefined : document.elements[id]
    if (!element) {
      continue
    }
    if (element.type === 'frame') {
      continue
    }
    if (element.type === 'connector') {
      // Why: elbow routes bend around their hosts; testing the unrouted path misses visible segments.
      const obstacles = connectorObstacles(document, element)
      if (connectorDistance(element, point, obstacles) <= (frameChrome.lineWidth ?? 6)) {
        return element
      }
      continue
    }
    if (rectContainsPoint(elementRect(element), point)) {
      return element
    }
  }
  // Frames are visually beneath everything, so test them after content.
  for (let i = document.order.length - 1; i >= 0; i -= 1) {
    const id = document.order[i]
    const element = id === undefined ? undefined : document.elements[id]
    if (!element || element.type !== 'frame') {
      continue
    }
    if (frameChromeContainsPoint(elementRect(element), point, frameChrome)) {
      return element
    }
  }
  return null
}

/** Selected ids plus every non-frame element fully inside a selected frame (frames carry contents). */
export function withFrameContents(
  document: CanvasDocument,
  ids: readonly ElementId[]
): ElementId[] {
  const result = new Set(ids)
  for (const id of ids) {
    const frame = document.elements[id]
    if (!frame || frame.type !== 'frame') {
      continue
    }
    const frameRect = elementRect(frame)
    for (const candidateId of document.order) {
      const candidate = document.elements[candidateId]
      if (
        candidate &&
        candidate.type !== 'frame' &&
        rectContainsRect(frameRect, elementRect(candidate))
      ) {
        result.add(candidateId)
      }
    }
  }
  return [...result]
}

/** Elements whose rect intersects the drag box. Frames must be fully enclosed to be picked. */
export function elementsInBox(document: CanvasDocument, box: Rect): ElementId[] {
  const picked: ElementId[] = []
  for (const id of document.order) {
    const element = document.elements[id]
    if (!element) {
      continue
    }
    const rect = elementRect(element)
    const hit = element.type === 'frame' ? rectContainsRect(box, rect) : rectsIntersect(box, rect)
    if (hit) {
      picked.push(id)
    }
  }
  return picked
}
