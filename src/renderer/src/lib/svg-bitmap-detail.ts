import type { ImageAsset } from '@shared/canvas/element-types'
import type { ImageDetailRegion } from '@shared/canvas/image-detail'
import { svgBitmapCache } from './svg-bitmap-cache'
import { imageHref, parseViewBox } from './svg-raster'

const SVG_NS = 'http://www.w3.org/2000/svg'

function fullViewportPhoto(svg: SVGSVGElement, aspect: number): Element | undefined {
  const box = parseViewBox(svg)
  if (!box || box[0] !== 0 || box[1] !== 0 || Math.abs(box[2] / box[3] / aspect - 1) > 0.00001) {
    return undefined
  }
  // Only a single full-viewport photo has the same geometry after separating its color from alpha.
  let node: Element = svg
  while (node.localName === 'svg' || node.localName === 'g') {
    if (
      (node !== svg && node.localName === 'svg') ||
      ['transform', 'style', 'filter', 'clip-path'].some((name) => node.hasAttribute(name))
    ) {
      return undefined
    }
    const children = [...node.children].filter((child) => child.localName !== 'defs')
    if (children.length !== 1) {
      return undefined
    }
    node = children[0]!
  }
  if (
    node.localName !== 'image' ||
    node.getAttribute('width') !== '100%' ||
    node.getAttribute('height') !== '100%' ||
    ['x', 'y', 'transform', 'style', 'filter', 'clip-path'].some((name) =>
      node.hasAttribute(name)
    ) ||
    svg.querySelector(
      'mask[x], mask[y], mask[width], mask[height], mask[maskUnits], mask[style], mask [mask], filter, use'
    )
  ) {
    return undefined
  }
  return node
}

export async function prepareSvgBitmapDetail(
  svg: SVGSVGElement,
  asset: ImageAsset,
  aspect: number,
  detail: ImageDetailRegion,
  signal?: AbortSignal
) {
  const photo = fullViewportPhoto(svg, aspect)
  if (!photo) {
    return undefined
  }
  const lease = svgBitmapCache.acquire(asset, imageHref(photo))
  try {
    const image = await lease.ready
    signal?.throwIfAborted()
    if (
      photo.getAttribute('preserveAspectRatio') !== 'none' &&
      Math.abs(image.naturalWidth / image.naturalHeight / aspect - 1) > 0.00001
    ) {
      lease.release()
      return undefined
    }
    const white = svg.ownerDocument.createElementNS(SVG_NS, 'rect')
    for (const name of ['id', 'width', 'height', 'mask', 'opacity', 'display', 'visibility']) {
      const value = photo.getAttribute(name)
      if (value !== null) {
        white.setAttribute(name, value)
      }
    }
    white.setAttribute('fill', 'white')
    white.setAttribute('fill-opacity', '1')
    white.setAttribute('stroke', 'none')
    photo.replaceWith(white)
    // The outer tile clips output, but WebKit otherwise allocates each mask at the full image scale.
    for (const mask of svg.querySelectorAll('mask')) {
      for (const [name, value] of Object.entries(detail.crop)) {
        mask.setAttribute(name, String(value))
      }
    }
    return { image, release: lease.release }
  } catch (error) {
    lease.release()
    throw error
  }
}
