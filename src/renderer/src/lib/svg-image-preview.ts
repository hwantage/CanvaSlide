import type { ImageAsset } from '@shared/canvas/element-types'
import type { ImageDetailRegion } from '@shared/canvas/image-detail'
import { svgPreviewSize } from '@shared/canvas/image-rendering'
import { rasterizeSvg, type ImagePreview } from './svg-raster'
import { prepareSvgBitmapDetail } from './svg-bitmap-detail'

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

function maskedBitmapSvg(root: SVGSVGElement): boolean {
  if (root.querySelector('text, foreignObject') || !root.querySelector('mask, filter')) {
    return false
  }
  const images = [...root.querySelectorAll('image')]
  return (
    images.length > 0 &&
    images.every((image) =>
      staticBitmap(
        image.getAttribute('href') ??
          image.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ??
          ''
      )
    )
  )
}

function stillSvg(data: string): SVGSVGElement | null {
  const doc = new DOMParser().parseFromString(decodeSvg(data), 'image/svg+xml')
  const root = doc.documentElement
  if (root.localName !== 'svg' || doc.querySelector('parsererror')) {
    return null
  }
  const viewBox = (root.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  if (
    viewBox.length !== 4 ||
    !viewBox.every(Number.isFinite) ||
    viewBox[2]! <= 0 ||
    viewBox[3]! <= 0
  ) {
    return null
  }
  // CSS and SMIL animation must keep their live renderer after the camera settles.
  if (doc.querySelector('animate, animateMotion, animateTransform, set, discard, script, style')) {
    return null
  }
  return root as unknown as SVGSVGElement
}

export function staticMaskedSvg(data: string): SVGSVGElement | null {
  const root = stillSvg(data)
  return root && maskedBitmapSvg(root) ? root : null
}

type SvgSource = { root: SVGSVGElement; masked: boolean } | null
const sources = new WeakMap<ImageAsset, SvgSource>()

function svgSource(asset: ImageAsset): SvgSource {
  if (!sources.has(asset)) {
    const root = stillSvg(asset.data)
    sources.set(asset, root ? { root, masked: maskedBitmapSvg(root) } : null)
  }
  return sources.get(asset)!
}

export async function createSvgImagePreview(
  asset: ImageAsset,
  aspect: number,
  detail?: ImageDetailRegion,
  signal?: AbortSignal,
  surface: 'png' | 'canvas' = 'png'
): Promise<ImagePreview> {
  signal?.throwIfAborted()
  // A second SVG image renderer regresses WebKit panning, so previews stay the original unless the
  // SVG is a bounded photo; a detail render at rest can re-render any still SVG's visible crop.
  const source = svgSource(asset)
  // Each crop mutates its own tree while all regions reuse the decoded, validated source.
  const svg =
    source && (detail || source.masked) ? (source.root.cloneNode(true) as SVGSVGElement) : null
  if (!svg) {
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
  const bitmap = await prepareSvgBitmapDetail(svg, asset, aspect, detail, signal)
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
  try {
    return await rasterizeSvg(
      crop,
      detail.pixels,
      signal,
      surface,
      bitmap ? { image: bitmap.image, crop: detail.crop } : undefined
    )
  } finally {
    bitmap?.release()
  }
}
