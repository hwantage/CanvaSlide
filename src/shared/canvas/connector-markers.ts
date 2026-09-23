import type { ArrowHead, ConnectorElement, Point, Rect } from './element-types'
import {
  arrowHeadSize,
  connectorRouteShape,
  routePathData,
  type ConnectorRouteShape
} from './connector-geometry'

/** The marker pair a connector carries; style memory and the style clipboard move it as one. */
export type ConnectorHeads = Pick<ConnectorElement, 'startHead' | 'endHead'>

/** One end marker in world coordinates: filled with the line colour, or stroked at its width. */
export type ConnectorMarker = { d: string; filled: boolean }

/** What a renderer draws: the line trimmed for its markers, the markers, and the full route. */
export type ConnectorDrawing = { d: string; markers: ConnectorMarker[]; route: string }

type MarkerOutline = { filled: boolean; trim: number } & (
  | { points: [number, number][] }
  | { circle: number }
)

/**
 * A marker's outline in its own frame: the end point at the origin, +x pointing out of the line.
 * Every marker stays behind the end point so none spills onto the element the end attaches to.
 */
function markerOutline(head: ArrowHead, size: number, width: number): MarkerOutline | null {
  const half = size / 2
  switch (head) {
    case 'none':
      return null
    case 'arrow':
      return {
        points: [
          [0, 0],
          [-size, -half],
          [-size, half]
        ],
        filled: true,
        trim: half
      }
    case 'openArrow':
      // The round join reaches half a stroke past the vertex, so the vertex sits that far back.
      return {
        points: [
          [-size, -half],
          [-width / 2, 0],
          [-size, half]
        ],
        filled: false,
        trim: width / 2
      }
    case 'circle': {
      const r = size * 0.4
      return { circle: r, filled: true, trim: r }
    }
    case 'diamond':
      return {
        points: [
          [0, 0],
          [-half, -size * 0.35],
          [-size, 0],
          [-half, size * 0.35]
        ],
        filled: true,
        trim: half
      }
    case 'bar':
      return {
        points: [
          [0, -half],
          [0, half],
          [-width, half],
          [-width, -half]
        ],
        filled: true,
        trim: width / 2
      }
  }
}

/** How far the line stops short of its end so a filled marker covers the stroke's round cap. */
export function markerTrim(head: ArrowHead, strokeWidth: number): number {
  return markerOutline(head, arrowHeadSize(strokeWidth), strokeWidth)?.trim ?? 0
}

const round = (value: number) => Math.round(value * 100) / 100

/** `points[at]` moved towards its neighbour, never past it nor past a straight line's middle. */
function pulledIn(points: Point[], at: number, neighbour: number, distance: number): Point {
  const p = points[at] as Point
  const q = points[neighbour] as Point
  const length = Math.hypot(q.x - p.x, q.y - p.y)
  const t = length > 0 ? Math.min(distance, points.length === 2 ? length / 2 : length) / length : 0
  return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }
}

/**
 * The route shortened by `start` and `end` world px. Only the end segments shrink, so elbows keep
 * their corners; a curve's end slides along its tangent towards its control point.
 */
export function trimRoute(
  shape: ConnectorRouteShape,
  start: number,
  end: number
): ConnectorRouteShape {
  const points = [...shape.points]
  const last = points.length - 1
  points[0] = pulledIn(shape.points, 0, 1, start)
  points[last] = pulledIn(shape.points, last, last - 1, end)
  return { ...shape, points } as ConnectorRouteShape
}

/** Marker path for `head` with its tip on `tip`, pointing away from `from` (the end's tangent). */
function markerAt(
  head: ArrowHead,
  tip: Point,
  from: Point,
  strokeWidth: number
): ConnectorMarker | null {
  const outline = markerOutline(head, arrowHeadSize(strokeWidth), strokeWidth)
  if (!outline) {
    return null
  }
  const length = Math.hypot(tip.x - from.x, tip.y - from.y)
  const ux = length > 0 ? (tip.x - from.x) / length : 1
  const uy = length > 0 ? (tip.y - from.y) / length : 0
  const at = (x: number, y: number) =>
    `${round(tip.x + ux * x - uy * y)} ${round(tip.y + uy * x + ux * y)}`
  if ('circle' in outline) {
    const r = round(outline.circle)
    const arc = `A ${r} ${r} 0 1 0`
    return { d: `M ${at(0, 0)} ${arc} ${at(-2 * r, 0)} ${arc} ${at(0, 0)} Z`, filled: true }
  }
  const d = outline.points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${at(x, y)}`).join(' ')
  return { d: outline.filled ? `${d} Z` : d, filled: outline.filled }
}

/** The line and markers every renderer (editor, HTML player, PDF) draws for `connector`. */
export function connectorDrawing(
  connector: ConnectorElement,
  obstacles: Rect[] = []
): ConnectorDrawing {
  const { strokeWidth } = connector.style
  const shape = connectorRouteShape(connector, obstacles)
  const { points } = shape
  const markers = [
    markerAt(connector.startHead, points[0] as Point, points[1] as Point, strokeWidth),
    markerAt(connector.endHead, points.at(-1) as Point, points.at(-2) as Point, strokeWidth)
  ].filter((marker): marker is ConnectorMarker => marker !== null)
  const trimmed = trimRoute(
    shape,
    markerTrim(connector.startHead, strokeWidth),
    markerTrim(connector.endHead, strokeWidth)
  )
  return { d: routePathData(trimmed), markers, route: routePathData(shape) }
}
