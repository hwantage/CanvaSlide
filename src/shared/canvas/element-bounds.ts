import { connectorDistance, connectorHosts, distanceToSegment } from './connector-geometry'
import {
  elementBox,
  elementRotation,
  pointsBounds,
  quadIntersectsRect,
  rectCenter,
  rotatedBounds,
  rotatedCorners,
  toLocalPoint
} from './element-rotation'
import type {
  CanvasDocument,
  CanvasElement,
  ElementId,
  Point,
  Rect,
  ShapeElement
} from './element-types'
import { triangleOutline } from './shape-svg'
import { visibleTextRect } from './text-clip'

/** The element's own upright box; a rotated element turns this about its centre. */
export function elementRect(element: CanvasElement): Rect {
  return { x: element.x, y: element.y, width: element.width, height: element.height }
}

/** Axis-aligned extent on the canvas, rotation included. */
export function elementBounds(element: CanvasElement): Rect {
  return rotatedBounds(elementBox(element))
}

/** The part of the upright box that is drawn: imported text can be clipped to its old frame. */
function visibleRect(element: CanvasElement): Rect {
  return element.type === 'text' ? visibleTextRect(element) : elementRect(element)
}

/** Point-in-outline test; the pivot is the whole box's centre even when text is clipped. */
function elementContainsPoint(element: CanvasElement, point: Point): boolean {
  const local = elementRotation(element) === 0 ? point : toLocalPoint(elementBox(element), point)
  return rectContainsPoint(visibleRect(element), local)
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

/**
 * Whether an upright-frame `point` lands on what a triangle draws (its fill and round-joined
 * stroke), or within `halo` of it. The box's empty upper corners pass through to what lies beneath.
 */
export function triangleContainsPoint(element: ShapeElement, point: Point, halo = 0): boolean {
  const { x, y, width, height } = element
  const box = { x: x - halo, y: y - halo, width: width + halo * 2, height: height + halo * 2 }
  if (!rectContainsPoint(box, point)) {
    return false
  }
  const p = { x: point.x - x, y: point.y - y }
  const [apex, right, left] = triangleOutline(element)
  const reach = halo + element.style.strokeWidth / 2
  const inside =
    cross(apex, right, p) >= 0 && cross(right, left, p) >= 0 && cross(left, apex, p) >= 0
  return (
    inside ||
    distanceToSegment(p, apex, right) <= reach ||
    distanceToSegment(p, right, left) <= reach ||
    distanceToSegment(p, left, apex) <= reach
  )
}

/** Corners of the drawn outline on the canvas (nw, ne, se, sw). */
function elementOutline(element: CanvasElement): Point[] {
  return rotatedCorners(visibleRect(element), elementRotation(element), rectCenter(element))
}

/** Axis-aligned extent of what is drawn: clipped text and rotation both count. */
export function visibleBounds(element: CanvasElement): Rect {
  return elementRotation(element) === 0
    ? visibleRect(element)
    : pointsBounds(elementOutline(element))
}

/**
 * Rect partway from one to another. The spotlight's cut-out travels with the camera this way, so a
 * lit frame hands the hole to the next one instead of the mask jumping there before the move.
 */
export function interpolateRect(from: Rect, to: Rect, t: number): Rect {
  const at = (a: number, b: number) => a + (b - a) * t
  return {
    x: at(from.x, to.x),
    y: at(from.y, to.y),
    width: at(from.width, to.width),
    height: at(from.height, to.height)
  }
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
      rects.push(elementBounds(element))
    }
  }
  return unionRects(rects)
}

/** A lone element grabs only inside its outline; a group grabs across its whole bounding box. */
export function selectionContainsPoint(
  document: CanvasDocument,
  ids: readonly ElementId[],
  point: Point
): boolean {
  const only = ids.length === 1 ? document.elements[ids[0] as ElementId] : undefined
  if (only && elementRotation(only) !== 0) {
    return elementContainsPoint(only, point)
  }
  const bounds = selectionBounds(document, ids)
  return bounds !== null && rectContainsPoint(bounds, point)
}

export function contentBounds(document: CanvasDocument): Rect | null {
  return unionRects(Object.values(document.elements).map(elementBounds))
}

/** World-unit sizes of the frame's grabbable chrome (screen px ÷ zoom). */
export type FrameHitChrome = { titleHeight: number; borderWidth: number; lineWidth?: number }

export function frameTitleStripContainsPoint(
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
  return rectContainsPoint(titleStrip, point)
}

/** True on the frame's title strip or within `borderWidth` of its outline. */
export function frameChromeContainsPoint(
  frame: Rect,
  point: Point,
  chrome: FrameHitChrome
): boolean {
  if (frameTitleStripContainsPoint(frame, point, chrome)) {
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

function topmostFrame(
  document: CanvasDocument,
  point: Point,
  hit: (frame: Rect) => boolean
): CanvasElement | null {
  for (let i = document.order.length - 1; i >= 0; i -= 1) {
    const id = document.order[i]
    const element = id === undefined ? undefined : document.elements[id]
    if (element?.type === 'frame' && hit(elementRect(element))) {
      return element
    }
  }
  return null
}

/** Topmost frame whose whole rect contains `point`; used for modifier-clicks on a frame's interior. */
export function frameContainingPoint(document: CanvasDocument, point: Point): CanvasElement | null {
  return topmostFrame(document, point, (rect) => rectContainsPoint(rect, point))
}

/**
 * Topmost element under `point`. Frames only hit on their chrome so content stays clickable, but
 * the title strip is drawn above content and therefore wins over it; the outline band only
 * counts where no content covers it.
 */
export function hitTestTopmost(
  document: CanvasDocument,
  point: Point,
  frameChrome: FrameHitChrome
): CanvasElement | null {
  const byTitle = topmostFrame(document, point, (rect) =>
    frameTitleStripContainsPoint(rect, point, frameChrome)
  )
  if (byTitle) {
    return byTitle
  }
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
      const hosts = connectorHosts(document, element)
      if (connectorDistance(element, point, hosts) <= (frameChrome.lineWidth ?? 6)) {
        return element
      }
      continue
    }
    if (elementContainsPoint(element, point)) {
      return element
    }
  }
  return topmostFrame(document, point, (rect) => frameChromeContainsPoint(rect, point, frameChrome))
}

/** Elements whose outline intersects the drag box. Frames must be fully enclosed to be picked. */
export function elementsInBox(document: CanvasDocument, box: Rect): ElementId[] {
  const picked: ElementId[] = []
  for (const id of document.order) {
    const element = document.elements[id]
    if (!element) {
      continue
    }
    const hit =
      element.type === 'frame'
        ? rectContainsRect(box, elementRect(element))
        : elementRotation(element) === 0
          ? rectsIntersect(box, visibleRect(element))
          : quadIntersectsRect(elementOutline(element), box)
    if (hit) {
      picked.push(id)
    }
  }
  return picked
}
