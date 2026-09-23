import { describe, expect, it } from 'vitest'
import {
  imageDetailRegions,
  mergeDetailTiles,
  imageDetailSourceRect,
  imageDetailSamplingRect,
  IMAGE_DETAIL_TILE_EDGE,
  LAYOUT_GRID
} from './image-detail'

const element = { x: 0, y: 0, width: 66000, height: 33000 }
const viewport = { width: 1280, height: 720 }
const preview = { width: 1600, height: 800 }

describe('visible image detail resolution', () => {
  it('keeps the bitmap sampling boundary a whole source pixel outside a fractional crop', () => {
    const crop = { x: 10.1, y: 20.9, width: 7.6, height: 5.8 }
    expect(imageDetailSamplingRect(crop, { width: 100, height: 80 })).toEqual({
      x: 9,
      y: 19,
      width: 10,
      height: 9
    })
    expect(
      imageDetailSamplingRect({ x: 0, y: 0, width: 100, height: 80 }, { width: 100, height: 80 })
    ).toEqual({ x: 0, y: 0, width: 100, height: 80 })
    expect(crop).toEqual({ x: 10.1, y: 20.9, width: 7.6, height: 5.8 })
  })

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
    // 2360 device pixels wide: two even tiles rather than a full one and a sliver.
    expect(regions).toHaveLength(2)
    expect(regions[0]!.pixels).toEqual({ width: 1180, height: 1240 })
    expect(regions[1]!.pixels).toEqual({ width: 1180, height: 1240 })
    expect(regions[0]!.crop.x).toBe(0)
    expect(regions[0]!.crop.x + regions[0]!.crop.width).toBeCloseTo(regions[1]!.crop.x, 12)
  })

  it('crops a rotated image to the part the viewport shows in its own frame', () => {
    const turned = { x: 0, y: 0, width: 4000, height: 2000, rotation: 90 }
    const merged = mergeDetailTiles(
      imageDetailRegions(turned, { x: 0, y: 0, zoom: 1 }, viewport, 1, preview)
    )!
    // The viewport's corner of the canvas sits over the image's lower middle once turned back.
    expect(merged.crop.x).toBeCloseTo(0.25, 3)
    expect(merged.crop.width).toBeCloseTo(0.18, 3)
    expect(merged.crop.y).toBeCloseTo(0.86, 3)
    expect(merged.crop.y + merged.crop.height).toBeCloseTo(1, 9)
  })

  it('bounds memory by visible physical pixels at extreme zoom without reducing their density', () => {
    const camera = { x: -33000 * 64, y: -16500 * 64, zoom: 64 }
    const regions = imageDetailRegions(element, camera, viewport, 3, preview)
    expect(
      regions.reduce((sum, region) => sum + region.pixels.width * region.pixels.height, 0)
    ).toBe(viewport.width * viewport.height * 9)
    for (const { crop, pixels } of regions) {
      // Rounding an edge up onto the layout grid can add a pixel to a tile, never more.
      expect(pixels.width).toBeLessThanOrEqual(IMAGE_DETAIL_TILE_EDGE + 1)
      expect(pixels.height).toBeLessThanOrEqual(IMAGE_DETAIL_TILE_EDGE + 1)
      expect(crop.width * element.width * camera.zoom * 3).toBeCloseTo(pixels.width, 6)
      expect(crop.height * element.height * camera.zoom * 3).toBeCloseTo(pixels.height, 6)
    }
    expect(regions[0]!.crop.x).toBe(0.5)
    expect(regions[0]!.crop.y).toBe(0.5)
  })

  it('covers fractional edges within a layout grid step, with no overlap, gaps or out-of-image crop', () => {
    const image = { x: 0, y: 0, width: 1500.3, height: 700.7 }
    const camera = { x: -100.1, y: 35.2, zoom: 1 }
    const regions = imageDetailRegions(image, camera, viewport, 2.5, { width: 64, height: 32 })
    const first = regions[0]!
    const last = regions.at(-1)!
    const leftEdge = first.crop.x * image.width + camera.x
    expect(leftEdge).toBeLessThanOrEqual(0)
    expect(leftEdge).toBeGreaterThan(-LAYOUT_GRID)
    expect(first.crop.y).toBe(0)
    const rightEdge = (last.crop.x + last.crop.width) * image.width + camera.x
    expect(rightEdge).toBeGreaterThanOrEqual(1280)
    expect(rightEdge).toBeLessThan(1280 + LAYOUT_GRID)
    const bottomEdge = (last.crop.y + last.crop.height) * image.height + camera.y
    expect(bottomEdge).toBeGreaterThanOrEqual(720)
    expect(bottomEdge).toBeLessThan(720 + LAYOUT_GRID)
    const source = { width: 1672, height: 941 }
    const a = imageDetailSourceRect(first.crop, source)
    const b = imageDetailSourceRect(last.crop, source)
    expect(a.x / source.width).toBeCloseTo(
      (Math.floor(100.1 / LAYOUT_GRID) * LAYOUT_GRID) / image.width,
      10
    )
    expect(b.x + b.width).toBeLessThanOrEqual(source.width)
    expect(b.y + b.height).toBeLessThanOrEqual(source.height)
  })

  it('puts the surface edges on the layout grid and cuts tiles at whole device pixels', () => {
    const image = { x: 12.345, y: -7.891, width: 1500.3, height: 700.7 }
    const camera = { x: -2000, y: -500, zoom: 61.5 }
    const regions = imageDetailRegions(image, camera, viewport, 2, { width: 64, height: 32 })
    expect(regions.length).toBeGreaterThan(1)
    const onGrid = (world: number) =>
      Math.abs(world / LAYOUT_GRID - Math.round(world / LAYOUT_GRID))
    const first = regions[0]!
    const last = regions.at(-1)!
    expect(onGrid(first.crop.x * image.width)).toBeLessThan(1e-6)
    expect(onGrid(first.crop.y * image.height)).toBeLessThan(1e-6)
    expect(onGrid((last.crop.x + last.crop.width) * image.width)).toBeLessThan(1e-6)
    expect(onGrid((last.crop.y + last.crop.height) * image.height)).toBeLessThan(1e-6)
    const merged = mergeDetailTiles(regions)!
    const scale = merged.pixels.width / (merged.crop.width * image.width)
    const rows = new Map<number, typeof regions>()
    for (const region of regions) {
      expect(region.pixels.width).toBeGreaterThan(0)
      expect(region.pixels.height).toBeGreaterThan(0)
      rows.set(region.crop.y, [...(rows.get(region.crop.y) ?? []), region])
    }
    const regionScale = (r: (typeof regions)[number]) =>
      r.pixels.width / (r.crop.width * image.width)
    for (const row of rows.values()) {
      row.sort((a, b) => a.crop.x - b.crop.x)
      for (let i = 1; i < row.length; i++) {
        // Adjacent tiles share their edges exactly, at a whole number of pixels from the start.
        expect(row[i - 1]!.crop.x + row[i - 1]!.crop.width).toBeCloseTo(row[i]!.crop.x, 12)
        expect(regionScale(row[i]!)).toBeCloseTo(scale, 6)
        const pixelsFromStart = (row[i]!.crop.x - first.crop.x) * image.width * scale
        expect(pixelsFromStart).toBeCloseTo(Math.round(pixelsFromStart), 6)
        expect(row[i - 1]!.pixels.width).toBe(
          Math.round(pixelsFromStart) -
            Math.round((row[i - 1]!.crop.x - first.crop.x) * image.width * scale)
        )
      }
    }
  })

  it('merges a tile grid into one surface covering the same crop, tile by tile', () => {
    const camera = { x: -33000 * 64, y: -16500 * 64, zoom: 64 }
    const regions = imageDetailRegions(element, camera, viewport, 3, preview)
    const merged = mergeDetailTiles(regions)!
    expect(regions.length).toBe(4)
    expect(merged.pixels).toEqual({ width: 1280 * 3, height: 720 * 3 })
    expect(merged.crop.x).toBe(regions[0]!.crop.x)
    expect(merged.crop.width).toBeCloseTo(
      regions.reduce((max, r) => Math.max(max, r.crop.x + r.crop.width), 0) - merged.crop.x,
      12
    )
    expect(merged.offsets).toEqual([
      { x: 0, y: 0 },
      { x: regions[0]!.pixels.width, y: 0 },
      { x: 0, y: regions[0]!.pixels.height },
      { x: regions[0]!.pixels.width, y: regions[0]!.pixels.height }
    ])
    expect(mergeDetailTiles([])).toBeNull()
  })
})
