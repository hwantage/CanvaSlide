import { describe, expect, it } from 'vitest'
import { imageSurfaceStyle } from './image-surface'

function mappedPoint(style: ReturnType<typeof imageSurfaceStyle>, x: number, y: number) {
  const [tx, ty, sx, sy] = style.transform.match(/-?[\d.]+(?:e[+-]?\d+)?/g)!.map(Number)
  return { x: tx! + x * sx!, y: ty! + y * sy! }
}

describe('image surface coordinates', () => {
  it.each([
    { image: { width: 32, height: 18.009569 }, pixels: { width: 3457, height: 2169 } },
    { image: { width: 66000.3, height: 40415.73 }, pixels: { width: 2561, height: 1441 } }
  ])('maps preview and cropped detail to the same image points', ({ image, pixels }) => {
    const crop = { x: 0.27351, y: 0.4317, width: 0.02345, height: 0.03891 }
    const previewPixels = { width: 1672, height: 941 }
    const preview = imageSurfaceStyle(image, previewPixels)
    for (const layoutZoom of [1, 6.444444, 12.888889, 49.57265, 64]) {
      const detail = imageSurfaceStyle(image, pixels, crop, layoutZoom)
      for (const u of [0, 0.37, 1]) {
        for (const v of [0, 0.63, 1]) {
          const a = mappedPoint(
            preview,
            (crop.x + u * crop.width) * preview.width,
            (crop.y + v * crop.height) * preview.height
          )
          const b = mappedPoint(detail, u * detail.width, v * detail.height)
          expect(a.x).toBeCloseTo(b.x, 10)
          expect(a.y).toBeCloseTo(b.y, 10)
        }
      }
      // After layout zoom, paint dimensions stay integral while the world coordinates stay fixed.
      expect(detail.width * layoutZoom).toBeCloseTo(pixels.width, 10)
      expect(detail.height * layoutZoom).toBeCloseTo(pixels.height, 10)
      expect(detail.transformOrigin).toBe('0 0')
    }
  })
})
