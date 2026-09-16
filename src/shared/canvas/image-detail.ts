import { worldRectToScreen } from './camera-transform'
import type { Camera, Rect, Size } from './element-types'

export type ImageDetailRegion = { crop: Rect; pixels: Size }
export const IMAGE_DETAIL_TILE_EDGE = 2048

export function imageDetailRegions(
  element: Rect,
  camera: Camera,
  viewport: Size,
  pixelRatio: number,
  preview: Size
): ImageDetailRegion[] {
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1
  const screen = worldRectToScreen(camera, element)
  if (screen.width * ratio <= preview.width && screen.height * ratio <= preview.height) {
    return []
  }
  const left = Math.max(0, screen.x)
  const top = Math.max(0, screen.y)
  const right = Math.min(viewport.width, screen.x + screen.width)
  const bottom = Math.min(viewport.height, screen.y + screen.height)
  if (right <= left || bottom <= top) {
    return []
  }
  const width = Math.ceil((right - left) * ratio)
  const height = Math.ceil((bottom - top) * ratio)
  const regions: ImageDetailRegion[] = []
  for (let y = 0; y < height; y += IMAGE_DETAIL_TILE_EDGE) {
    for (let x = 0; x < width; x += IMAGE_DETAIL_TILE_EDGE) {
      const pixels = {
        width: Math.min(IMAGE_DETAIL_TILE_EDGE, width - x),
        height: Math.min(IMAGE_DETAIL_TILE_EDGE, height - y)
      }
      regions.push({
        crop: {
          x: (left - screen.x + ((right - left) * x) / width) / screen.width,
          y: (top - screen.y + ((bottom - top) * y) / height) / screen.height,
          width: ((right - left) * pixels.width) / width / screen.width,
          height: ((bottom - top) * pixels.height) / height / screen.height
        },
        pixels
      })
    }
  }
  return regions
}
