import type { Camera, Point, Rect, Size } from './element-types'

export const MIN_ZOOM = 0.02
export const MAX_ZOOM = 64
export const DEFAULT_CAMERA: Camera = { x: 0, y: 0, zoom: 1 }

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) {
    return 1
  }
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

export function worldToScreen(camera: Camera, point: Point): Point {
  return { x: point.x * camera.zoom + camera.x, y: point.y * camera.zoom + camera.y }
}

export function screenToWorld(camera: Camera, point: Point): Point {
  return { x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom }
}

export function worldRectToScreen(camera: Camera, rect: Rect): Rect {
  const origin = worldToScreen(camera, rect)
  return {
    x: origin.x,
    y: origin.y,
    width: rect.width * camera.zoom,
    height: rect.height * camera.zoom
  }
}

export function panBy(camera: Camera, dx: number, dy: number): Camera {
  return { ...camera, x: camera.x + dx, y: camera.y + dy }
}

/** Zooms so the world point under `anchor` (screen px) stays under the cursor. */
export function zoomAtScreenPoint(camera: Camera, anchor: Point, nextZoom: number): Camera {
  const zoom = clampZoom(nextZoom)
  const worldAnchor = screenToWorld(camera, anchor)
  return {
    zoom,
    x: anchor.x - worldAnchor.x * zoom,
    y: anchor.y - worldAnchor.y * zoom
  }
}

// Why: exponential mapping makes each wheel notch feel like the same relative step.
const WHEEL_ZOOM_SENSITIVITY = 0.0025
/** Trackpad pinch arrives as ctrl+wheel with tiny deltas; boost it so a pinch feels direct. */
export const PINCH_ZOOM_MULTIPLIER = 1.5
/** Below this |deltaY| (pixel mode) a ctrl+wheel is a pinch, not a mouse-wheel notch (±100). */
export const PINCH_DELTA_LIMIT = 50

export function wheelDeltaToZoomFactor(deltaY: number, multiplier = 1): number {
  return Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY * multiplier)
}

export function zoomByWheel(camera: Camera, anchor: Point, deltaY: number, multiplier = 1): Camera {
  return zoomAtScreenPoint(camera, anchor, camera.zoom * wheelDeltaToZoomFactor(deltaY, multiplier))
}

export function cameraForWorldCenter(center: Point, zoom: number, viewport: Size): Camera {
  const z = clampZoom(zoom)
  return { zoom: z, x: viewport.width / 2 - center.x * z, y: viewport.height / 2 - center.y * z }
}

export function visibleWorldRect(camera: Camera, viewport: Size): Rect {
  const topLeft = screenToWorld(camera, { x: 0, y: 0 })
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: viewport.width / camera.zoom,
    height: viewport.height / camera.zoom
  }
}

export function viewportCenterWorld(camera: Camera, viewport: Size): Point {
  return screenToWorld(camera, { x: viewport.width / 2, y: viewport.height / 2 })
}

/** Pan lives on `transform`; zoom is applied with CSS `zoom` so text/SVG re-layout crisply. */
export function cameraPanCssTransform(camera: Camera): string {
  return `translate(${camera.x}px, ${camera.y}px)`
}

/** How long the zoom must hold still before the world is re-laid out with CSS `zoom`. */
export const ZOOM_SETTLE_MS = 120

/**
 * CSS `zoom` to lay the world out at for a settled camera zoom. Why: WebKit clamps zoomed text to a
 * "smart minimum" font size (6px), so zooming out with CSS `zoom` leaves glyphs 3× too large and
 * spilling out of their boxes. Below 100% the layout stays at 1 and only the transform shrinks it.
 */
export function layoutZoomFor(zoom: number): number {
  return Math.max(1, zoom)
}

/**
 * Layer transform while `baseZoom` is the CSS zoom currently laid out. Why: CSS `zoom` re-lays out
 * every element (tens of ms on large documents), so gestures and animations scale the already
 * laid-out layer on the compositor and the zoom is committed only once the camera settles.
 */
export function worldLayerCssTransform(camera: Camera, baseZoom: number): string {
  const translate = cameraPanCssTransform(camera)
  const scale = camera.zoom / baseZoom
  return Math.abs(scale - 1) < 1e-9 ? translate : `${translate} scale(${scale})`
}

export function rectToCssPosition(rect: Rect): {
  left: number
  top: number
  width: number
  height: number
} {
  return { left: rect.x, top: rect.y, width: rect.width, height: rect.height }
}

export function camerasEqual(a: Camera, b: Camera, epsilon = 1e-6): boolean {
  return (
    Math.abs(a.x - b.x) < epsilon &&
    Math.abs(a.y - b.y) < epsilon &&
    Math.abs(a.zoom - b.zoom) < epsilon
  )
}
