import type { Point, Rect, Size } from '../canvas/element-types'

export type PdfPagePlacement = { page: Rect; frame: Rect }

export type PdfLayoutOptions = {
  /** Top-left of the grid in world units. */
  origin: Point
  /** Every page is scaled to this width; height follows the page's aspect ratio. */
  pageWidth: number
  /** Space between pages, both directions. */
  gap: number
  /** Grid columns; defaults to the square-ish `ceil(sqrt(n))`. */
  columns?: number
}

export const PDF_PAGE_WIDTH = 960
export const PDF_PAGE_GAP = 80

/**
 * Lays imported pages out row by row in a grid, in reading order. Each page gets a frame of the
 * same rect so the import is immediately presentable as slides.
 */
export function layoutPdfPages(
  sizes: readonly Size[],
  options: PdfLayoutOptions
): PdfPagePlacement[] {
  const columns = Math.max(1, options.columns ?? Math.ceil(Math.sqrt(sizes.length)))
  const placements: PdfPagePlacement[] = []
  let rowTop = options.origin.y
  let rowHeight = 0
  sizes.forEach((size, index) => {
    const column = index % columns
    if (column === 0 && index > 0) {
      rowTop += rowHeight + options.gap
      rowHeight = 0
    }
    const width = options.pageWidth
    const height = size.width > 0 ? (size.height / size.width) * width : width
    const rect: Rect = {
      x: options.origin.x + column * (width + options.gap),
      y: rowTop,
      width,
      height
    }
    rowHeight = Math.max(rowHeight, height)
    placements.push({ page: rect, frame: { ...rect } })
  })
  return placements
}
