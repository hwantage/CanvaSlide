import { describe, expect, it } from 'vitest'
import { imageDetailRegions, IMAGE_DETAIL_TILE_EDGE } from './image-detail'

const element = { x: 0, y: 0, width: 66000, height: 33000 }
const viewport = { width: 1280, height: 720 }
const preview = { width: 1600, height: 800 }

describe('visible image detail resolution', () => {
  it('keeps sufficient previews and excludes offscreen images', () => {
    expect(imageDetailRegions(element, { x: 0, y: 0, zoom: 0.02 }, viewport, 1, preview)).toEqual(
      []
    )
    expect(imageDetailRegions(element, { x: 2000, y: 0, zoom: 1 }, viewport, 2, preview)).toEqual(
      []
    )
  })

  it('upgrades for Retina even when CSS dimensions fit the preview', () => {
    const regions = imageDetailRegions(
      element,
      { x: 100, y: 100, zoom: 0.02 },
      viewport,
      2,
      preview
    )
    expect(regions).toHaveLength(2)
    expect(regions[0]!.pixels).toEqual({ width: 2048, height: 1240 })
    expect(regions[1]!.pixels).toEqual({ width: 312, height: 1240 })
    expect(regions[0]!.crop.x).toBe(0)
    expect(regions[0]!.crop.x + regions[0]!.crop.width).toBeCloseTo(regions[1]!.crop.x, 12)
  })

  it('bounds memory by visible physical pixels at extreme zoom without reducing their density', () => {
    const camera = { x: -33000 * 64, y: -16500 * 64, zoom: 64 }
    const regions = imageDetailRegions(element, camera, viewport, 3, preview)
    expect(
      regions.reduce((sum, region) => sum + region.pixels.width * region.pixels.height, 0)
    ).toBe(viewport.width * viewport.height * 9)
    for (const { crop, pixels } of regions) {
      expect(pixels.width).toBeLessThanOrEqual(IMAGE_DETAIL_TILE_EDGE)
      expect(pixels.height).toBeLessThanOrEqual(IMAGE_DETAIL_TILE_EDGE)
      expect(crop.width * element.width * camera.zoom * 3).toBeCloseTo(pixels.width, 6)
      expect(crop.height * element.height * camera.zoom * 3).toBeCloseTo(pixels.height, 6)
    }
    expect(regions[0]!.crop.x).toBe(0.5)
    expect(regions[0]!.crop.y).toBe(0.5)
  })

  it('covers fractional edges exactly with no overlap, gaps or out-of-image crop', () => {
    const image = { x: 0, y: 0, width: 1500.3, height: 700.7 }
    const camera = { x: -100.1, y: 35.2, zoom: 1 }
    const regions = imageDetailRegions(image, camera, viewport, 2.5, { width: 64, height: 32 })
    const first = regions[0]!
    const last = regions.at(-1)!
    expect(first.crop.x * image.width + camera.x).toBeCloseTo(0, 10)
    expect(first.crop.y).toBe(0)
    expect((last.crop.x + last.crop.width) * image.width + camera.x).toBeCloseTo(1280, 10)
    expect((last.crop.y + last.crop.height) * image.height + camera.y).toBeCloseTo(720, 10)
  })
})
