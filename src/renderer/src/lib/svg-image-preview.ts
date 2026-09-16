import type { ImageAsset } from '@shared/canvas/element-types'
import type { ImageDetailRegion } from '@shared/canvas/image-detail'
import { svgPreviewSize } from '@shared/canvas/image-rendering'
import { rasterizeSvg, type ImagePreview } from './svg-raster'

export type { ImagePreview } from './svg-raster'

export function originalImagePreview(asset: ImageAsset): ImagePreview {
  return { src: asset.data, bytes: 0, dispose: () => {} }
}

function decodeSvg(data: string): string {
  const comma = data.indexOf(',')
  if (comma < 0 || !data.startsWith('data:')) {
    throw new Error('Expected an inline SVG')
  }
  if (!data.slice(0, comma).includes(';base64')) {
    return decodeURIComponent(data.slice(comma + 1))
  }
  const binary = atob(data.slice(comma + 1))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder().decode(bytes)
}

function staticBitmap(data: string): boolean {
  if (/^data:image\/jpeg;/i.test(data)) {
    return true
  }
  if (!/^data:image\/png;[^,]*base64,/i.test(data)) {
    return false
  }
  // APNG declares animation before IDAT; unknown or oversized headers keep the original image.
  const header = atob(data.slice(data.indexOf(',') + 1, data.indexOf(',') + 1 + 65536))
  if (header.slice(0, 8) !== '\x89PNG\r\n\x1a\n') {
    return false
  }
  for (let offset = 8; offset + 8 <= header.length;) {
    const type = header.slice(offset + 4, offset + 8)
    if (type === 'acTL') {
      return false
    }
    if (type === 'IDAT') {
      return true
    }
    const length =
      header.charCodeAt(offset) * 16777216 +
      header.charCodeAt(offset + 1) * 65536 +
      header.charCodeAt(offset + 2) * 256 +
      header.charCodeAt(offset + 3)
    offset += length + 12
  }
  return false
}

export function staticMaskedSvg(data: string): SVGSVGElement | null {
  const doc = new DOMParser().parseFromString(decodeSvg(data), 'image/svg+xml')
  const root = doc.documentElement
  if (root.localName !== 'svg' || doc.querySelector('parsererror')) {
    return null
  }
  const viewBox = (root.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  // A viewBox is needed to scale coordinates when bounding the preview viewport.
  if (
    viewBox.length !== 4 ||
    !viewBox.every(Number.isFinite) ||
    viewBox[2]! <= 0 ||
    viewBox[3]! <= 0
  ) {
    return null
  }
  // Animation and vector text retain their original renderer and resolution.
  if (
    doc.querySelector(
      'animate, animateMotion, animateTransform, set, discard, style, script, text, foreignObject'
    )
  ) {
    return null
  }
  if (!doc.querySelector('mask, filter')) {
    return null
  }
  const images = [...doc.querySelectorAll('image')]
  if (
    !images.length ||
    images.some(
      (image) =>
        !staticBitmap(
          image.getAttribute('href') ??
            image.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ??
            ''
        )
    )
  ) {
    return null
  }
  return root as unknown as SVGSVGElement
}

export async function createSvgImagePreview(
  asset: ImageAsset,
  aspect: number,
  detail?: ImageDetailRegion,
  signal?: AbortSignal
): Promise<ImagePreview> {
  signal?.throwIfAborted()
  const svg = staticMaskedSvg(asset.data)
  if (!svg) {
    // A second SVG image renderer regresses WebKit panning; only decode the bounded PNG previews.
    return originalImagePreview(asset)
  }
  const viewBox = (svg.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  const pixelLength = (name: string) => {
    const value = svg.getAttribute(name) ?? ''
    return /^[\d.]+(?:px)?$/.test(value) ? Number.parseFloat(value) : 0
  }
  const edge = Math.max(
    pixelLength('width') || viewBox[2] || asset.width,
    pixelLength('height') || viewBox[3] || asset.height
  )
  const viewport =
    aspect >= 1 ? { width: edge, height: edge / aspect } : { width: edge * aspect, height: edge }
  const size = detail ? viewport : svgPreviewSize(viewport)
  // Explicit pixel dimensions prevent WebKit from allocating masks at the element's world size.
  svg.setAttribute('width', String(size.width))
  svg.setAttribute('height', String(size.height))
  if (!detail) {
    return rasterizeSvg(svg, size, signal)
  }
  // Nesting preserves percentage geometry and meet/slice alignment while clipping the render surface.
  const crop = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  crop.setAttribute('width', String(detail.pixels.width))
  crop.setAttribute('height', String(detail.pixels.height))
  crop.setAttribute('preserveAspectRatio', 'none')
  crop.setAttribute(
    'viewBox',
    `${detail.crop.x * size.width} ${detail.crop.y * size.height} ${detail.crop.width * size.width} ${detail.crop.height * size.height}`
  )
  svg.setAttribute('x', '0')
  svg.setAttribute('y', '0')
  svg.setAttribute('overflow', 'hidden')
  crop.appendChild(svg)
  return rasterizeSvg(crop, detail.pixels, signal)
}
