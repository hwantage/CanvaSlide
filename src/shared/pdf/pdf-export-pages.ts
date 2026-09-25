import { elementBounds, elementRect, rectsIntersect } from '../canvas/element-bounds'
import type { CanvasDocument, CanvasElement, FrameElement, Size } from '../canvas/element-types'
import { orderedFrames } from '../canvas/presentation-sequence'
import { connectorCanvasRect } from '../canvas/shape-svg'

/**
 * The page resolutions on offer, finest first so the dialog reads the same way down the list as the
 * HTML panel's image quality does. They are named for how much detail they keep rather than for a
 * medium, because the same file is as likely to be read on a screen as printed.
 */
export const pdfResolutions = ['high', 'medium', 'low'] as const
export type PdfResolution = (typeof pdfResolutions)[number]

/**
 * How many pixels a page is rasterised at per PDF point. 72 pt/in makes these 216, 144 and 96 dpi;
 * the middle one puts a 16:9 slide at 1920 px, which is what the deck was authored against.
 */
const pdfPixelsPerPoint: Record<PdfResolution, number> = {
  high: 3,
  medium: 2,
  low: 4 / 3
}

/**
 * The long edge every page is scaled to, in PDF points. 960 pt is 13.333 in, so a 16:9 frame comes
 * out as the 13.333 × 7.5 in page PowerPoint and Keynote use for widescreen slides — whatever the
 * frame measures in world units, which are arbitrary on an infinite canvas.
 */
export const PDF_LONG_EDGE_PT = 960

/** The page box range the PDF format allows, in points. */
const MIN_EDGE_PT = 3
const MAX_EDGE_PT = 14400

/**
 * The smallest canvas area any engine we target will paint (WebKit on iOS). Today's page sizes stay
 * an order of magnitude inside it — `PDF_LONG_EDGE_PT` caps a page at 960 pt, so the largest surface
 * is a square 2880 px print page — so this is a ceiling for a future page-size change, not a limit
 * the export reaches. Without it, raising `PDF_LONG_EDGE_PT` would silently blank pages instead.
 */
const MAX_RASTER_PIXELS = 16_777_216

/** Why the rounding: a page box is written with four decimals, and 960/n*n must not land on 959.9. */
function edge(value: number): number {
  return Number(Math.min(MAX_EDGE_PT, Math.max(MIN_EDGE_PT, value)).toFixed(4))
}

/**
 * The page a frame prints on: the frame's own aspect ratio, scaled so its long edge is
 * `PDF_LONG_EDGE_PT`. Degenerate frames still produce a page the format accepts.
 */
export function pdfPageSize(frame: Size): Size {
  const width = frame.width > 0 ? frame.width : 1
  const height = frame.height > 0 ? frame.height : 1
  const scale = PDF_LONG_EDGE_PT / Math.max(width, height)
  return { width: edge(width * scale), height: edge(height * scale) }
}

/**
 * Whole pixels for the bitmap that fills `page`, shrunk uniformly if the surface would exceed what
 * a canvas can hold. Never smaller than a single pixel in either direction.
 */
export function pdfRasterSize(page: Size, resolution: PdfResolution): Size {
  const perPoint = pdfPixelsPerPoint[resolution]
  const width = page.width * perPoint
  const height = page.height * perPoint
  const pixels = width * height
  const over = pixels > MAX_RASTER_PIXELS
  const fit = over ? Math.sqrt(MAX_RASTER_PIXELS / pixels) : 1
  // Rounding up a shrunk surface would put it back over the limit it was shrunk to meet.
  const whole = over ? Math.floor : Math.round
  return { width: Math.max(1, whole(width * fit)), height: Math.max(1, whole(height * fit)) }
}

/** One frame, the page it prints on and the bitmap that page is filled with. */
export type PdfExportPage = {
  frame: FrameElement
  /** 1-based position in the presentation sequence. */
  number: number
  page: Size
  raster: Size
}

/** One page per frame, in presentation order; a document without frames exports nothing. */
export function pdfExportPages(
  document: CanvasDocument,
  resolution: PdfResolution
): PdfExportPage[] {
  return orderedFrames(document).map((frame, index) => {
    const page = pdfPageSize(frame)
    return { frame, number: index + 1, page, raster: pdfRasterSize(page, resolution) }
  })
}

/**
 * What a page draws, bottom to top: every element reaching into the frame, clipped to it by the
 * renderer. A slide show frames exactly this rect, so anything overlapping its edge belongs on the
 * page as far as it goes. Frames are editor chrome and never print, their own included.
 */
export function pdfPageElements(document: CanvasDocument, frame: FrameElement): CanvasElement[] {
  const box = elementRect(frame)
  return document.order.flatMap((id) => {
    const element = document.elements[id]
    if (!element || element.type === 'frame') {
      return []
    }
    // Connectors paint arrowheads and thick strokes outside their own bounds.
    const bounds =
      element.type === 'connector' ? connectorCanvasRect(element) : elementBounds(element)
    return rectsIntersect(box, bounds) ? [element] : []
  })
}
