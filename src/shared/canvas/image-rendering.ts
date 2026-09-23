import { MAX_ZOOM, worldRectToScreen } from './camera-transform'
import type { Camera, Rect, Size } from './element-types'
import { rotatedBounds, type RotatedRect } from './element-rotation'
import { createCameraTween } from './zoom-pan-interpolation'

export const IMAGE_RENDER_MARGIN = 256
export const SVG_PREVIEW_MAX_EDGE = 2048
/** Longest edge, in CSS px, an SVG shown as-is is laid out at so the engine rasterizes it that big. */
export const SVG_IMAGE_LAYOUT_EDGE = 1024

/**
 * How many times larger than its world rect an SVG `<img>` is laid out (and scaled back down by
 * its own transform). Why: WebKit rasterizes an SVG image at its layout size, and the world is
 * laid out at zoom 1, so a small vector image zoomed in on during a flight is drawn from a raster
 * a few pixels wide — its fine lines and small text vanish until the detail render at rest brings
 * them back. Laid out this much larger it stays legible up to the maximum zoom, within a bounded
 * raster.
 */
export function svgImageLayoutScale(size: Size): number {
  const edge = Math.max(size.width, size.height)
  if (!Number.isFinite(edge) || edge <= 0) {
    return 1
  }
  return Math.min(MAX_ZOOM, Math.max(1, SVG_IMAGE_LAYOUT_EDGE / edge))
}

export function imageIntersectsViewport(
  rect: RotatedRect,
  camera: Camera,
  viewport: Size
): boolean {
  const screen = worldRectToScreen(camera, rotatedBounds(rect))
  return (
    Math.max(screen.width, screen.height) >= 1 &&
    screen.x + screen.width >= -IMAGE_RENDER_MARGIN &&
    screen.y + screen.height >= -IMAGE_RENDER_MARGIN &&
    screen.x <= viewport.width + IMAGE_RENDER_MARGIN &&
    screen.y <= viewport.height + IMAGE_RENDER_MARGIN
  )
}

export function imagesAlongCameraPath<T extends Rect>(
  images: T[],
  from: Camera,
  target: Camera,
  viewport: Size
): T[] {
  const tween = createCameraTween(from, target, viewport)
  const cameras = Array.from({ length: 65 }, (_, index) => tween.at(index / 64))
  return images.filter((image) =>
    cameras.some((camera) => imageIntersectsViewport(image, camera, viewport))
  )
}

export function svgPreviewSize(size: Size): Size {
  const width = Number.isFinite(size.width) && size.width > 0 ? size.width : 300
  const height = Number.isFinite(size.height) && size.height > 0 ? size.height : 150
  const scale = Math.min(1, SVG_PREVIEW_MAX_EDGE / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  }
}

/** Keep small images out of WebKit's low-resolution backing stores during compositor zooms. */
export function imageLayoutScale(size: Size, layoutZoom: number, renderZoom: number): number {
  const edge = Math.max(size.width, size.height)
  if (!(edge > 0) || !Number.isFinite(edge) || !(layoutZoom > 0)) {
    return 1
  }
  return Math.max(1, Math.min(MAX_ZOOM, renderZoom, SVG_PREVIEW_MAX_EDGE / edge) / layoutZoom)
}
