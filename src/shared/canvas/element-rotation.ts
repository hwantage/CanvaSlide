import type {
  CanvasDocument,
  CanvasElement,
  ConnectorEnd,
  ElementId,
  Point,
  Rect
} from './element-types'
import {
  handleAnchorPoints,
  resizeRect,
  scaleRectWithin,
  type HandlePosition,
  type ResizeOptions
} from './resize-handles'

/** Rotation is stored normalised to this range, in degrees clockwise about the element centre. */
export const MAX_ROTATION_DEGREES = 180

/** Shift-drag on the rotation handle snaps to multiples of this. */
export const ROTATION_SNAP_DEGREES = 15

/** A box turned `rotation` degrees clockwise about its own centre; omitted means upright. */
export type RotatedRect = Rect & { rotation?: number | undefined }

/** Frames are views, connectors follow their ends and video focus flies upright, so they stay put. */
export function isRotatable(element: CanvasElement): boolean {
  return element.type === 'shape' || element.type === 'text' || element.type === 'image'
}

/** Needs something rotatable and nothing that cannot turn; connectors come along by their ends. */
export function canRotateSelection(document: CanvasDocument, ids: readonly ElementId[]): boolean {
  const elements = ids.flatMap((id) => document.elements[id] ?? [])
  return (
    elements.some(isRotatable) &&
    elements.every((element) => isRotatable(element) || element.type === 'connector')
  )
}

export function elementRotation(element: CanvasElement): number {
  return 'rotation' in element ? (element.rotation ?? 0) : 0
}

/** The element's own box and turn, for geometry that follows the rotated outline. */
export function elementBox(element: CanvasElement): RotatedRect {
  const { x, y, width, height } = element
  const rotation = elementRotation(element)
  return rotation === 0 ? { x, y, width, height } : { x, y, width, height, rotation }
}

/** Maps any angle into (-180, 180]; -0 becomes 0 so a full turn stores as upright. */
export function normalizeRotation(degrees: number): number {
  const wrapped = degrees - 360 * Math.floor((degrees + 180) / 360)
  const turned = wrapped === -180 ? 180 : wrapped
  return turned === 0 ? 0 : turned
}

export function snapRotation(degrees: number, step = ROTATION_SNAP_DEGREES): number {
  return normalizeRotation(Math.round(degrees / step) * step)
}

export function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

export function rotatePoint(point: Point, center: Point, degrees: number): Point {
  if (degrees === 0) {
    return point
  }
  const radians = (degrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const dx = point.x - center.x
  const dy = point.y - center.y
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos }
}

/** Angle from `center` to `point` in degrees, clockwise from +x since screen y points down. */
export function pointerAngle(center: Point, point: Point): number {
  return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI
}

/** `point` in the box's own upright frame, so upright rect tests apply to a turned box. */
export function toLocalPoint(box: RotatedRect, point: Point): Point {
  return rotatePoint(point, rectCenter(box), -(box.rotation ?? 0))
}

/** Corners nw, ne, se, sw of `rect` turned about `center`, which may be a larger box's centre. */
export function rotatedCorners(
  rect: Rect,
  rotation = 0,
  center: Point = rectCenter(rect)
): Point[] {
  const { x, y, width, height } = rect
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height }
  ].map((corner) => rotatePoint(corner, center, rotation))
}

export function pointsBounds(points: readonly Point[]): Rect {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

/** Axis-aligned bounds of the turned box: what selection, snapping and fitting measure. */
export function rotatedBounds(box: RotatedRect): Rect {
  const { x, y, width, height } = box
  const rotation = box.rotation ?? 0
  return rotation === 0 ? { x, y, width, height } : pointsBounds(rotatedCorners(box, rotation))
}

/** Separating-axis test between a convex quad and an upright rect; touching edges do not count. */
export function quadIntersectsRect(corners: readonly Point[], rect: Rect): boolean {
  const box = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height }
  ]
  const axes: Point[] = [
    { x: 1, y: 0 },
    { x: 0, y: 1 }
  ]
  for (let i = 0; i < 2; i += 1) {
    const a = corners[i] as Point
    const b = corners[i + 1] as Point
    axes.push({ x: a.y - b.y, y: b.x - a.x })
  }
  return axes.every((axis) => {
    const project = (points: readonly Point[]) => points.map((p) => p.x * axis.x + p.y * axis.y)
    const quad = project(corners)
    const upright = project(box)
    return Math.min(...quad) < Math.max(...upright) && Math.max(...quad) > Math.min(...upright)
  })
}

/** Handle anchors on the turned box, in the same frame as `box`. */
export function rotatedHandleAnchors(box: RotatedRect): Record<HandlePosition, Point> {
  const anchors = handleAnchorPoints(box)
  const rotation = box.rotation ?? 0
  if (rotation === 0) {
    return anchors
  }
  const center = rectCenter(box)
  const turned = {} as Record<HandlePosition, Point>
  for (const [handle, point] of Object.entries(anchors) as [HandlePosition, Point][]) {
    turned[handle] = rotatePoint(point, center, rotation)
  }
  return turned
}

/** The rotation handle sits `offset` beyond the top edge's midpoint and turns with the box. */
export function rotationHandlePoint(box: RotatedRect, offset: number): Point {
  const top = { x: box.x + box.width / 2, y: box.y - offset }
  return rotatePoint(top, rectCenter(box), box.rotation ?? 0)
}

/** Resizes along the box's own axes; the corner an upright resize holds stays put on the canvas. */
export function resizeRotatedRect(
  box: RotatedRect,
  handle: HandlePosition,
  delta: Point,
  options: ResizeOptions = {}
): Rect {
  const rotation = box.rotation ?? 0
  const upright = { x: box.x, y: box.y, width: box.width, height: box.height }
  if (rotation === 0) {
    return resizeRect(upright, handle, delta, options)
  }
  const local = rotatePoint(delta, { x: 0, y: 0 }, -rotation)
  const next = resizeRect(upright, handle, local, options)
  const fixed = (rect: Rect): Point => ({
    x: handle.includes('w') ? rect.x + rect.width : rect.x,
    y: handle.includes('n') ? rect.y + rect.height : rect.y
  })
  const before = rotatePoint(fixed(upright), rectCenter(upright), rotation)
  const after = rotatePoint(fixed(next), rectCenter(next), rotation)
  return { ...next, x: next.x + before.x - after.x, y: next.y + before.y - after.y }
}

/** Where the box's top-left corner shows on the canvas once turned. */
export function rotatedOrigin(box: RotatedRect): Point {
  return rotatePoint({ x: box.x, y: box.y }, rectCenter(box), box.rotation ?? 0)
}

/** New size for a turned box that keeps its visible top-left corner, as typing and text growth do. */
export function resizeKeepingOrigin(box: RotatedRect, width: number, height: number): Rect {
  const next = { x: box.x, y: box.y, width, height }
  if (!box.rotation) {
    return next
  }
  const before = rotatedOrigin(box)
  const after = rotatedOrigin({ ...next, rotation: box.rotation })
  return { ...next, x: box.x + before.x - after.x, y: box.y + before.y - after.y }
}

/** Group scaling: the centre follows and each side takes its axis's scaled length; no shear. */
export function scaleRotatedRectWithin(box: RotatedRect, from: Rect, to: Rect): Rect {
  if (!box.rotation) {
    return scaleRectWithin({ x: box.x, y: box.y, width: box.width, height: box.height }, from, to)
  }
  const sx = from.width === 0 ? 1 : to.width / from.width
  const sy = from.height === 0 ? 1 : to.height / from.height
  const radians = ((box.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const width = box.width * Math.hypot(sx * cos, sy * sin)
  const height = box.height * Math.hypot(sx * sin, sy * cos)
  const center = rectCenter(box)
  const moved = { x: to.x + (center.x - from.x) * sx, y: to.y + (center.y - from.y) * sy }
  return { x: moved.x - width / 2, y: moved.y - height / 2, width, height }
}

/** Turns a box about `pivot`: its centre orbits and its own rotation adds up. */
export function rotateRectAbout(
  box: RotatedRect,
  pivot: Point,
  degrees: number
): Rect & { rotation: number } {
  const center = rotatePoint(rectCenter(box), pivot, degrees)
  return {
    x: center.x - box.width / 2,
    y: center.y - box.height / 2,
    width: box.width,
    height: box.height,
    rotation: normalizeRotation((box.rotation ?? 0) + degrees)
  }
}

/** Patch turning `element` by `degrees` about `pivot`; content that cannot turn stays put. */
export function rotateElementAbout(
  element: CanvasElement,
  pivot: Point,
  degrees: number
): Partial<CanvasElement> {
  if (element.type === 'connector') {
    const turn = (end: ConnectorEnd): ConnectorEnd =>
      end.elementId ? end : { ...end, ...rotatePoint(end, pivot, degrees) }
    return { start: turn(element.start), end: turn(element.end) }
  }
  return isRotatable(element) ? rotateRectAbout(elementBox(element), pivot, degrees) : {}
}

/** Drag turn from pointer angles; `snap` puts a lone element (`base`) or a group's turn on steps. */
export function rotationDragDelta(
  startAngle: number,
  angle: number,
  base: number | null,
  snap: boolean
): number {
  const raw = normalizeRotation(angle - startAngle)
  if (!snap) {
    return raw
  }
  return base === null ? snapRotation(raw) : snapRotation(base + raw) - base
}

/** CSS transform for a turned element whose origin is its own centre; undefined when upright. */
export function rotationTransform(rotation: number | undefined): string | undefined {
  return rotation ? `rotate(${rotation}deg)` : undefined
}
