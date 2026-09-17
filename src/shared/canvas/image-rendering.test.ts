import { describe, expect, it } from 'vitest'
import {
  imageIntersectsViewport,
  imageLayoutScale,
  imagesAlongCameraPath,
  svgImageLayoutScale,
  svgPreviewSize
} from './image-rendering'

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

  it('lays a small SVG image out up to the maximum zoom larger, a big one only up to the raster edge', () => {
    expect(svgImageLayoutScale({ width: 14.56, height: 3.71 })).toBe(64)
    expect(svgImageLayoutScale({ width: 32, height: 18 })).toBe(32)
    expect(svgImageLayoutScale({ width: 720, height: 405 })).toBeCloseTo(1024 / 720, 9)
    expect(svgImageLayoutScale({ width: 4000, height: 100 })).toBe(1)
    expect(svgImageLayoutScale({ width: 0, height: 0 })).toBe(1)
  })
})

describe('image layout scale', () => {
  it('renders a tiny image at enough pixels for the maximum camera zoom', () => {
    const image = { width: 32, height: 18 }
    expect(imageLayoutScale(image, 1, 64)).toBe(64)
    for (const zoom of [1, 11, 44, 64]) {
      expect(image.width * imageLayoutScale(image, zoom, 64) * zoom).toBeCloseTo(2048)
    }
  })

  it('bounds the backing size and leaves large or already enlarged layouts alone', () => {
    expect(imageLayoutScale({ width: 400, height: 200 }, 1, 64)).toBeCloseTo(5.12)
    expect(imageLayoutScale({ width: 400, height: 200 }, 8, 64)).toBe(1)
    expect(imageLayoutScale({ width: 66000, height: 40000 }, 1, 64)).toBe(1)
    expect(imageLayoutScale({ width: 14, height: 4 }, 1, 64)).toBe(64)
  })

  it('does not allocate for zoom levels the flight never visits', () => {
    const image = { width: 32, height: 18 }
    expect(imageLayoutScale(image, 1, 1)).toBe(1)
    expect(imageLayoutScale(image, 1, 4)).toBe(4)
    expect(imageLayoutScale(image, 4, 4)).toBe(1)
  })

  it('handles portrait and degenerate sizes without producing invalid transforms', () => {
    expect(imageLayoutScale({ width: 18, height: 32 }, 1, 64)).toBe(64)
    expect(imageLayoutScale({ width: 0, height: 0 }, 1, 64)).toBe(1)
    expect(imageLayoutScale({ width: Infinity, height: 1 }, 1, 64)).toBe(1)
    expect(imageLayoutScale({ width: 32, height: 18 }, 0, 64)).toBe(1)
  })
})
