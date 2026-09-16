import { describe, expect, it } from 'vitest'
import { imageIntersectsViewport, imagesAlongCameraPath, svgPreviewSize } from './image-rendering'

describe('image rendering bounds', () => {
  const viewport = { width: 1400, height: 900 }
  const camera = { x: 0, y: 0, zoom: 0.02 }

  it('keeps an enormous image covering the viewport and excludes distant images', () => {
    expect(
      imageIntersectsViewport(
        { x: -10000, y: -10000, width: 66000, height: 40000 },
        camera,
        viewport
      )
    ).toBe(true)
    expect(
      imageIntersectsViewport({ x: 100000, y: 0, width: 1000, height: 1000 }, camera, viewport)
    ).toBe(false)
  })

  it('prefetches just outside the viewport and skips subpixel images', () => {
    expect(
      imageIntersectsViewport(
        { x: 1450, y: 0, width: 100, height: 100 },
        { ...camera, zoom: 1 },
        viewport
      )
    ).toBe(true)
    expect(imageIntersectsViewport({ x: 0, y: 0, width: 32, height: 18 }, camera, viewport)).toBe(
      false
    )
    expect(
      imageIntersectsViewport(
        { x: 0, y: 0, width: 32, height: 18 },
        { ...camera, zoom: 50 },
        viewport
      )
    ).toBe(true)
  })

  it('bounds raster memory without confusing world dimensions with pixel dimensions', () => {
    expect(svgPreviewSize({ width: 1602, height: 981 })).toEqual({ width: 1602, height: 981 })
    expect(svgPreviewSize({ width: 66000, height: 33000 })).toEqual({ width: 2048, height: 1024 })
    expect(svgPreviewSize({ width: 1, height: 1e12 })).toEqual({ width: 1, height: 2048 })
    expect(svgPreviewSize({ width: Number.NaN, height: 0 })).toEqual({ width: 300, height: 150 })
  })

  it('prepares images along the flight, including content outside both endpoint viewports', () => {
    const from = { x: 0, y: 0, zoom: 1 }
    const target = { x: -10000, y: 0, zoom: 1 }
    const first = { x: 100, y: 100, width: 100, height: 100 }
    const middle = { ...first, x: 5000 }
    const last = { ...first, x: 10500 }
    const distant = { ...first, x: 1000000 }
    expect(imageIntersectsViewport(middle, from, viewport)).toBe(false)
    expect(imageIntersectsViewport(middle, target, viewport)).toBe(false)
    expect(imagesAlongCameraPath([first, middle, last, distant], from, target, viewport)).toEqual([
      first,
      middle,
      last
    ])
  })

  it('prepares subpixel images that become visible when zooming in', () => {
    const image = { x: 0, y: 0, width: 32, height: 18 }
    expect(imageIntersectsViewport(image, camera, viewport)).toBe(false)
    expect(imagesAlongCameraPath([image], camera, { ...camera, zoom: 50 }, viewport)).toEqual([
      image
    ])
  })
})
