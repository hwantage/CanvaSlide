import type {
  AnchorSide,
  CanvasDocument,
  CanvasElement,
  ConnectorElement,
  ConnectorEnd,
  Point,
  Rect
} from './element-types'
import { anchorSides } from './element-types'
import { cubicAt, curveControls, orthogonalPoints } from './connector-routing'

/** Midpoint of one side of a rect: the four connection points every element offers. */
export function anchorPoint(rect: Rect, side: AnchorSide): Point {
  switch (side) {
    case 'top':
      return { x: rect.x + rect.width / 2, y: rect.y }
    case 'right':
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
    case 'bottom':
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height }
    case 'left':
      return { x: rect.x, y: rect.y + rect.height / 2 }
  }
}

export function nearestAnchorSide(rect: Rect, point: Point): AnchorSide {
  let best: AnchorSide = 'top'
  let bestDistance = Number.POSITIVE_INFINITY
  for (const side of anchorSides) {
    const p = anchorPoint(rect, side)
    const d = Math.hypot(p.x - point.x, p.y - point.y)
    if (d < bestDistance) {
      bestDistance = d
      best = side
    }
  }
  return best
}

/** The side of `rect` that faces `target`: the natural port when the other end sits there. */
export function facingSide(rect: Rect, target: Point): AnchorSide {
  const outsideX = target.x < rect.x ? -1 : target.x > rect.x + rect.width ? 1 : 0
  const outsideY = target.y < rect.y ? -1 : target.y > rect.y + rect.height ? 1 : 0
  if (outsideX !== 0 && outsideY === 0) {
    return outsideX < 0 ? 'left' : 'right'
  }
  if (outsideY !== 0 && outsideX === 0) {
    return outsideY < 0 ? 'top' : 'bottom'
  }
  const dx = target.x - (rect.x + rect.width / 2)
  const dy = target.y - (rect.y + rect.height / 2)
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx < 0 ? 'left' : 'right'
  }
  return dy < 0 ? 'top' : 'bottom'
}

/** Arrowhead edge length in world px: readable on 1px lines, grows gently with thicker strokes. */
export function arrowHeadSize(strokeWidth: number): number {
  return 8 + strokeWidth * 3
}

export function isConnectable(element: CanvasElement): boolean {
  return element.type !== 'connector'
}

export type ConnectorPath = {
  /** Straight segments approximating the path (curves are sampled); used for hit tests & bounds. */
  polyline: Point[]
  /** SVG path data in world coordinates. */
  d: string
}

export function connectorPath(connector: ConnectorElement, obstacles: Rect[] = []): ConnectorPath {
  const a = { x: connector.start.x, y: connector.start.y }
  const b = { x: connector.end.x, y: connector.end.y }
  switch (connector.route) {
    case 'straight':
      return { polyline: [a, b], d: `M ${a.x} ${a.y} L ${b.x} ${b.y}` }
    case 'orthogonal': {
      const points = orthogonalPoints(a, connector.start.side, b, connector.end.side, obstacles)
      return {
        polyline: points,
        d: points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
      }
    }
    case 'curved': {
      const { c1, c2 } = curveControls(a, connector.start.side, b, connector.end.side)
      const samples = 24
      const polyline: Point[] = []
      for (let i = 0; i <= samples; i += 1) {
        polyline.push(cubicAt(a, c1, c2, b, i / samples))
      }
      return { polyline, d: `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}` }
    }
  }
}

/** Point along the path at half its length (label placement). */
export function connectorMidpoint(connector: ConnectorElement, obstacles: Rect[] = []): Point {
  const { polyline } = connectorPath(connector, obstacles)
  let total = 0
  for (let i = 1; i < polyline.length; i += 1) {
    const p = polyline[i - 1] as Point
    const q = polyline[i] as Point
    total += Math.hypot(q.x - p.x, q.y - p.y)
  }
  let remaining = total / 2
  for (let i = 1; i < polyline.length; i += 1) {
    const p = polyline[i - 1] as Point
    const q = polyline[i] as Point
    const length = Math.hypot(q.x - p.x, q.y - p.y)
    if (remaining <= length && length > 0) {
      const t = remaining / length
      return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }
    }
    remaining -= length
  }
  return polyline[0] ?? { x: connector.start.x, y: connector.start.y }
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  const t =
    lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t))
}

export function connectorDistance(
  connector: ConnectorElement,
  point: Point,
  obstacles: Rect[] = []
): number {
  const { polyline } = connectorPath(connector, obstacles)
  let best = Number.POSITIVE_INFINITY
  for (let i = 1; i < polyline.length; i += 1) {
    best = Math.min(best, distanceToSegment(point, polyline[i - 1] as Point, polyline[i] as Point))
  }
  return best
}

export function connectorBounds(connector: ConnectorElement, obstacles: Rect[] = []): Rect {
  const { polyline } = connectorPath(connector, obstacles)
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const p of polyline) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }
}

function hostOf(document: CanvasDocument, end: ConnectorEnd): CanvasElement | null {
  const host = end.elementId ? document.elements[end.elementId] : undefined
  return host && isConnectable(host) ? host : null
}

function center(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

/** Ports are chosen automatically: an attached end always uses the side facing the other end. */
function resolveEnd(
  document: CanvasDocument,
  end: ConnectorEnd,
  other: ConnectorEnd
): ConnectorEnd {
  if (!end.elementId) {
    return end
  }
  const host = hostOf(document, end)
  if (!host) {
    // Why: the host is gone (deleted, or not pasted along) — keep the line where it was.
    return { x: end.x, y: end.y }
  }
  const otherHost = hostOf(document, other)
  const target = otherHost ? center(otherHost) : { x: other.x, y: other.y }
  const side = end.pinned && end.side ? end.side : facingSide(host, target)
  const point = anchorPoint(host, side)
  return {
    x: point.x,
    y: point.y,
    elementId: end.elementId,
    side,
    ...(end.pinned ? { pinned: true } : {})
  }
}

/** Host boxes the elbow router should avoid crossing. */
export function connectorObstacles(document: CanvasDocument, connector: ConnectorElement): Rect[] {
  return [connector.start, connector.end].flatMap((end) => {
    const host = hostOf(document, end)
    return host ? [{ x: host.x, y: host.y, width: host.width, height: host.height }] : []
  })
}

function endsEqual(a: ConnectorEnd, b: ConnectorEnd): boolean {
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.elementId === b.elementId &&
    a.side === b.side &&
    (a.pinned ?? false) === (b.pinned ?? false)
  )
}

/** Re-resolves attached ends and the bounding box; returns the same document when nothing moved. */
export function syncConnectorGeometry(document: CanvasDocument): CanvasDocument {
  let elements: CanvasDocument['elements'] | null = null
  for (const [id, element] of Object.entries(document.elements)) {
    if (element.type !== 'connector') {
      continue
    }
    const start = resolveEnd(document, element.start, element.end)
    const end = resolveEnd(document, element.end, element.start)
    const resolved =
      endsEqual(start, element.start) && endsEqual(end, element.end)
        ? element
        : { ...element, start, end }
    const bounds = connectorBounds(resolved, connectorObstacles(document, resolved))
    const boundsChanged =
      bounds.x !== resolved.x ||
      bounds.y !== resolved.y ||
      bounds.width !== resolved.width ||
      bounds.height !== resolved.height
    if (resolved === element && !boundsChanged) {
      continue
    }
    elements ??= { ...document.elements }
    elements[id] = { ...resolved, ...bounds }
  }
  return elements ? { ...document, elements } : document
}

/** Shifts free ends; attached ends are re-resolved by the sync pass. */
export function translateConnector(connector: ConnectorElement, delta: Point): ConnectorElement {
  const shift = (end: ConnectorEnd): ConnectorEnd =>
    end.elementId ? end : { ...end, x: end.x + delta.x, y: end.y + delta.y }
  return {
    ...connector,
    x: connector.x + delta.x,
    y: connector.y + delta.y,
    start: shift(connector.start),
    end: shift(connector.end)
  }
}

export function scalePointWithin(point: Point, from: Rect, to: Rect): Point {
  const sx = from.width === 0 ? 1 : to.width / from.width
  const sy = from.height === 0 ? 1 : to.height / from.height
  return { x: to.x + (point.x - from.x) * sx, y: to.y + (point.y - from.y) * sy }
}

export function scaleConnectorWithin(
  connector: ConnectorElement,
  from: Rect,
  to: Rect
): ConnectorElement {
  const map = (end: ConnectorEnd): ConnectorEnd =>
    end.elementId ? end : { ...end, ...scalePointWithin(end, from, to) }
  return { ...connector, start: map(connector.start), end: map(connector.end) }
}

/** Remaps attachments after duplicate/paste: hosts copied along stay attached, others detach. */
export function remapConnectorHosts(
  connector: ConnectorElement,
  idMap: ReadonlyMap<string, string>,
  keepUnmapped: boolean
): ConnectorElement {
  const remap = (end: ConnectorEnd): ConnectorEnd => {
    if (!end.elementId) {
      return end
    }
    const mapped = idMap.get(end.elementId)
    if (mapped) {
      return { ...end, elementId: mapped }
    }
    return keepUnmapped ? end : { x: end.x, y: end.y }
  }
  return { ...connector, start: remap(connector.start), end: remap(connector.end) }
}
