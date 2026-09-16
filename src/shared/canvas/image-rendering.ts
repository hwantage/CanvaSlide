import { worldRectToScreen } from './camera-transform'
import type { Camera, Rect, Size } from './element-types'
import { createCameraTween } from './zoom-pan-interpolation'

export const IMAGE_RENDER_MARGIN = 256
export const SVG_PREVIEW_MAX_EDGE = 2048

export function imageIntersectsViewport(rect: Rect, camera: Camera, viewport: Size): boolean {
  const screen = worldRectToScreen(camera, rect)
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
