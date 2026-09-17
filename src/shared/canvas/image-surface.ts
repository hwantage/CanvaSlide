import type { Rect, Size } from './element-types'

const FULL_IMAGE: Rect = { x: 0, y: 0, width: 1, height: 1 }

/** Map a raster's local pixels to the image's world size, relative to their shared origin. */
export function imageSurfaceStyle(image: Size, pixels: Size, crop: Rect = FULL_IMAGE) {
  return {
    width: pixels.width,
    height: pixels.height,
    transformOrigin: '0 0',
    // WebKit snaps a canvas's paint rect to integer layout pixels before applying transforms.
    transform: `translate(${crop.x * image.width}px, ${crop.y * image.height}px) scale(${(crop.width * image.width) / pixels.width}, ${(crop.height * image.height) / pixels.height})`
  }
}
