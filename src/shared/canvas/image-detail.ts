import { worldRectToScreen } from './camera-transform'
import type { Camera, Point, Rect, Size } from './element-types'

export type ImageDetailRegion = { crop: Rect; pixels: Size }
export const IMAGE_DETAIL_TILE_EDGE = 2048
/** Small world-space outset so the crop still covers edges after browser layout quantization. */
export const LAYOUT_GRID = 1 / 64

export function imageDetailSourceRect(crop: Rect, source: Size): Rect {
  return {
    x: crop.x * source.width,
    y: crop.y * source.height,
    width: crop.width * source.width,
    height: crop.height * source.height
  }
}

/** Include the interpolation footprint so a fractional transform cannot fade the sampled edge. */
export function imageDetailSamplingRect(crop: Rect, source: Size): Rect {
  const x = Math.max(0, Math.floor(crop.x) - 1)
  const y = Math.max(0, Math.floor(crop.y) - 1)
  return {
    x,
    y,
    width: Math.min(source.width, Math.ceil(crop.x + crop.width) + 1) - x,
    height: Math.min(source.height, Math.ceil(crop.y + crop.height) + 1) - y
  }
}

/**
 * Splits the visible span of one axis into tiles of at most `edge` device pixels. The span is
 * widened onto the layout grid at both ends (so the tiles cover everything the preview showed and
 * rounding at the viewport edge cannot expose a gap), then cut at whole device pixels. Every tile renders at
 * exactly the surface's scale and its pixels sit at whole offsets in it, so the picture is
 * continuous across tile boundaries. Returns world offsets from the image origin and pixel counts.
 */
function tileEdges(
  visibleStart: number,
  visibleEnd: number,
  extent: number,
  scale: number,
  edge: number
): { offsets: number[]; pixels: number[] } {
  const start = Math.max(0, Math.floor(visibleStart / LAYOUT_GRID) * LAYOUT_GRID)
  const end = Math.min(extent, Math.ceil(visibleEnd / LAYOUT_GRID) * LAYOUT_GRID)
  const total = Math.round((end - start) * scale)
  if (end <= start || total < 1) {
    return { offsets: [], pixels: [] }
  }
  const count = Math.max(1, Math.ceil(total / edge))
  const offsets = [start]
  const pixels: number[] = []
  let done = 0
  for (let index = 0; index < count; index++) {
    const size = Math.round((total * (index + 1)) / count) - done
    done += size
    pixels.push(size)
    offsets.push(index + 1 < count ? start + (done / total) * (end - start) : end)
  }
  return { offsets, pixels }
}

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
  const scale = camera.zoom * ratio
  const xs = tileEdges(
    (left - screen.x) / camera.zoom,
    (right - screen.x) / camera.zoom,
    element.width,
    scale,
    IMAGE_DETAIL_TILE_EDGE
  )
  const ys = tileEdges(
    (top - screen.y) / camera.zoom,
    (bottom - screen.y) / camera.zoom,
    element.height,
    scale,
    IMAGE_DETAIL_TILE_EDGE
  )
  const regions: ImageDetailRegion[] = []
  for (let row = 0; row < ys.pixels.length; row++) {
    for (let column = 0; column < xs.pixels.length; column++) {
      regions.push({
        crop: {
          x: xs.offsets[column]! / element.width,
          y: ys.offsets[row]! / element.height,
          width: (xs.offsets[column + 1]! - xs.offsets[column]!) / element.width,
          height: (ys.offsets[row + 1]! - ys.offsets[row]!) / element.height
        },
        pixels: { width: xs.pixels[column]!, height: ys.pixels[row]! }
      })
    }
  }
  return regions
}

export type MergedDetail = { crop: Rect; pixels: Size; offsets: Point[] }

/**
 * One surface for all of an image's tiles: the crop they cover together, its pixel size, and where
 * each tile's pixels go in it. Why: tiles are rendered separately to bound each SVG raster, but
 * shown separately their shared edges fall on fractional device pixels, where two abutting
 * surfaces each cover part of a pixel and a translucent photo composites twice — a hairline at
 * every seam. One surface has no seams.
 */
export function mergeDetailTiles(regions: ImageDetailRegion[]): MergedDetail | null {
  if (!regions.length) {
    return null
  }
  const columns = [...new Set(regions.map((r) => r.crop.x))].sort((a, b) => a - b)
  const rows = [...new Set(regions.map((r) => r.crop.y))].sort((a, b) => a - b)
  const widthOf = (x: number) => regions.find((r) => r.crop.x === x)!.pixels.width
  const heightOf = (y: number) => regions.find((r) => r.crop.y === y)!.pixels.height
  const columnOffsets = new Map<number, number>()
  const rowOffsets = new Map<number, number>()
  let width = 0
  for (const x of columns) {
    columnOffsets.set(x, width)
    width += widthOf(x)
  }
  let height = 0
  for (const y of rows) {
    rowOffsets.set(y, height)
    height += heightOf(y)
  }
  const right = regions.find((r) => r.crop.x === columns.at(-1))!
  const bottom = regions.find((r) => r.crop.y === rows.at(-1))!
  return {
    crop: {
      x: columns[0]!,
      y: rows[0]!,
      width: right.crop.x + right.crop.width - columns[0]!,
      height: bottom.crop.y + bottom.crop.height - rows[0]!
    },
    pixels: { width, height },
    offsets: regions.map((r) => ({ x: columnOffsets.get(r.crop.x)!, y: rowOffsets.get(r.crop.y)! }))
  }
}
