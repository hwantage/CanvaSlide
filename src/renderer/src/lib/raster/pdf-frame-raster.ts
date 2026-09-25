import elementCss from '@shared/render/element.css?raw'
import { renderElement } from '@shared/render/element-dom'
import type { CanvasDocument, FrameElement, Size, VideoElement } from '@shared/canvas/element-types'
import { pdfPageElements } from '@shared/pdf/pdf-export-pages'
import type { PdfImage } from '@shared/pdf/pdf-file'
import { zoomLayerCssStyle } from '@shared/canvas/zoom-layer-style'
import { loadImage } from './svg-raster'

/**
 * Draws one frame as the bitmap its PDF page is made of.
 *
 * The page content is the static element DOM the HTML export player also draws with, laid out
 * inside an SVG `<foreignObject>` and rasterised through the engine's own text and layout code.
 * Sharing `renderElement` is what keeps a PDF page and the HTML export showing the same slide.
 *
 * Why a `data:` URL rather than the `blob:` URL `svg-raster.ts` uses: Chromium and WebKit treat a
 * blob-backed SVG that contains a `foreignObject` as cross-origin and taint the canvas, so the
 * pixels could never be read back. A data URL is same-origin and reads back fine.
 *
 * Fonts need no embedding here, unlike the HTML export: the page is rasterised on the machine that
 * is showing the deck, so every family the editor resolves resolves here too.
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

/** A printed page is plain white; the canvas tint behind a frame is editor chrome. */
const PAGE_BACKGROUND = '#ffffff'

/** Videos cannot play in a PDF, so their box prints as a still the reader can recognise. */
function videoPlaceholder(element: VideoElement): HTMLElement {
  const node = document.createElement('div')
  node.className = 'uc-el'
  Object.assign(node.style, {
    left: `${element.x}px`,
    top: `${element.y}px`,
    width: `${element.width}px`,
    height: `${element.height}px`,
    background: 'var(--video-backdrop)',
    borderRadius: '4px'
  })
  const glyph = document.createElementNS(SVG_NS, 'svg')
  const size = Math.max(16, Math.min(element.width, element.height) * 0.22)
  glyph.setAttribute('viewBox', '0 0 24 24')
  glyph.setAttribute('width', String(size))
  glyph.setAttribute('height', String(size))
  Object.assign(glyph.style, {
    position: 'absolute',
    left: `${(element.width - size) / 2}px`,
    top: `${(element.height - size) / 2}px`
  })
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', 'M8 5v14l11-7z')
  path.setAttribute('fill', 'rgba(255,255,255,0.82)')
  glyph.append(path)
  node.append(glyph)
  return node
}

/** The page as one SVG document: the frame's content, clipped to the frame, scaled to `raster`. */
function framePageSvg(doc: CanvasDocument, frame: FrameElement, raster: Size): string {
  const page = document.createElement('div')
  Object.assign(page.style, {
    position: 'relative',
    width: `${raster.width}px`,
    height: `${raster.height}px`,
    overflow: 'hidden',
    background: PAGE_BACKGROUND
  })
  const style = document.createElement('style')
  style.textContent = elementCss
  page.append(style)

  // Why layout zoom rather than the SVG's own viewBox: WebKit does not scale `foreignObject`
  // content by the viewBox transform, and lays it out at raw CSS pixels in a corner of the page.
  // Zooming is also how the editor's world layer scales, `fontOpticalSizing` compensation and all,
  // so a page is laid out through the same path the author was looking at.
  const zoom = document.createElement('div')
  // The larger ratio of the two: rounding the raster to whole pixels can leave the frame a whisker
  // short of an edge, and a sub-pixel overhang the page clips beats a white hairline down one side.
  const { zoom: factor, fontOpticalSizing } = zoomLayerCssStyle(
    Math.max(raster.width / frame.width, raster.height / frame.height),
    navigator.userAgent
  )
  Object.assign(zoom.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    zoom: String(factor),
    fontOpticalSizing
  })
  const world = document.createElement('div')
  Object.assign(world.style, { position: 'absolute', left: `${-frame.x}px`, top: `${-frame.y}px` })
  for (const element of pdfPageElements(doc, frame)) {
    const node = element.type === 'video' ? videoPlaceholder(element) : renderElement(element, doc)
    if (node) {
      world.append(node)
    }
  }
  zoom.append(world)
  page.append(zoom)

  const markup = new XMLSerializer().serializeToString(page)
  // The foreignObject's own viewport clips too, which is the belt to the page div's braces.
  return (
    `<svg xmlns="${SVG_NS}" width="${raster.width}" height="${raster.height}" ` +
    `viewBox="0 0 ${raster.width} ${raster.height}">` +
    `<foreignObject x="0" y="0" width="${raster.width}" height="${raster.height}">${markup}</foreignObject>` +
    '</svg>'
  )
}

export type FramePageRasterInput = {
  document: CanvasDocument
  frame: FrameElement
  /** Pixel size of the bitmap; see `pdfRasterSize`. */
  raster: Size
  /** JPEG quality, 0..1. */
  quality: number
  signal?: AbortSignal
}

/** The frame as a baseline JPEG, ready to go into a PDF page verbatim. */
export async function rasterizeFramePage({
  document: source,
  frame,
  raster,
  quality,
  signal
}: FramePageRasterInput): Promise<PdfImage> {
  signal?.throwIfAborted()
  const svg = framePageSvg(source, frame, raster)
  const image = await loadImage(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    signal
  )
  const canvas = document.createElement('canvas')
  try {
    await image.decode()
    signal?.throwIfAborted()
    canvas.width = raster.width
    canvas.height = raster.height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Canvas raster is unavailable')
    }
    // JPEG has no alpha; painting the page colour first keeps transparent areas from going black.
    context.fillStyle = PAGE_BACKGROUND
    context.fillRect(0, 0, raster.width, raster.height)
    context.drawImage(image, 0, 0, raster.width, raster.height)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('PDF page encoding failed'))),
        'image/jpeg',
        quality
      )
    )
    signal?.throwIfAborted()
    return {
      data: new Uint8Array(await blob.arrayBuffer()),
      width: raster.width,
      height: raster.height
    }
  } finally {
    image.src = ''
    canvas.width = 0
    canvas.height = 0
  }
}
