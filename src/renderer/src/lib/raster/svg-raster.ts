import type { Rect, Size } from '@shared/canvas/element-types'
import { imageDetailSamplingRect, imageDetailSourceRect } from '@shared/canvas/image-detail'

const XLINK_NS = 'http://www.w3.org/1999/xlink'

/** The four `viewBox` numbers, or null when absent, malformed or not a positive box. */
export function parseViewBox(svg: Element): [number, number, number, number] | null {
  const box = (svg.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  const [x, y, width, height] = box
  if (box.length !== 4 || !box.every(Number.isFinite) || width! <= 0 || height! <= 0) {
    return null
  }
  return [x!, y!, width!, height!]
}

/** An SVG `<image>`'s source, whichever of the two href spellings it uses. */
export function imageHref(node: Element): string {
  return node.getAttribute('href') ?? node.getAttributeNS(XLINK_NS, 'href') ?? ''
}

export type ImagePreview = {
  src: string
  size?: Size
  canvas?: HTMLCanvasElement
  bytes: number
  dispose: () => void
}

export async function loadImage(src: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  signal?.throwIfAborted()
  const image = new Image()
  await new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      image.onload = null
      image.onerror = null
      if (error) {
        image.src = ''
        reject(error)
      } else {
        resolve()
      }
    }
    const abort = () => finish(new DOMException('Raster cancelled', 'AbortError'))
    const timer = setTimeout(() => finish(new Error('SVG raster timed out')), 10000)
    signal?.addEventListener('abort', abort, { once: true })
    image.onload = () => finish()
    image.onerror = () => finish(new Error('SVG raster could not be decoded'))
    image.src = src
  })
  return image
}

export async function rasterizeSvg(
  svg: SVGSVGElement,
  size: Size,
  signal?: AbortSignal,
  surface: 'png' | 'canvas' = 'png',
  bitmap?: { image: HTMLImageElement; crop: Rect }
): Promise<ImagePreview> {
  signal?.throwIfAborted()
  const sourceUrl = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })
  )
  const canvas = document.createElement('canvas')
  let image: HTMLImageElement | undefined
  let decoded: HTMLImageElement | undefined
  let src: string | undefined
  let retainedCanvas = false
  try {
    image = await loadImage(sourceUrl, signal)
    await image.decode()
    signal?.throwIfAborted()
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Canvas raster is unavailable')
    }
    context.drawImage(image, 0, 0, size.width, size.height)
    if (bitmap) {
      const source = imageDetailSourceRect(bitmap.crop, {
        width: bitmap.image.naturalWidth,
        height: bitmap.image.naturalHeight
      })
      context.globalCompositeOperation = 'source-in'
      // Why integral rects under a fractional transform: WebKit rounds a fractional source rect
      // to whole source pixels and snaps a fractional destination rect to device pixels, and
      // either shifts a tile by up to a pixel against its neighbours — a step at every seam once a
      // source pixel spans several screen pixels. With the crop's fraction carried by the canvas
      // transform, both rects stay integral and the sampling is exact.
      const scaleX = size.width / source.width
      const scaleY = size.height / source.height
      const sample = imageDetailSamplingRect(source, {
        width: bitmap.image.naturalWidth,
        height: bitmap.image.naturalHeight
      })
      context.save()
      context.setTransform(scaleX, 0, 0, scaleY, -source.x * scaleX, -source.y * scaleY)
      context.drawImage(
        bitmap.image,
        sample.x,
        sample.y,
        sample.width,
        sample.height,
        sample.x,
        sample.y,
        sample.width,
        sample.height
      )
      context.restore()
    }
    if (surface === 'canvas') {
      // Avoid the synchronous pixel readback and PNG encoding used by image previews.
      retainedCanvas = true
      return {
        src: '',
        canvas,
        size,
        bytes: size.width * size.height * 4,
        dispose: () => {
          canvas.width = 0
          canvas.height = 0
        }
      }
    }
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('SVG raster encoding failed'))),
        'image/png'
      )
    )
    signal?.throwIfAborted()
    src = URL.createObjectURL(blob)
    decoded = await loadImage(src, signal)
    await decoded.decode()
    signal?.throwIfAborted()
    const retained = decoded
    const retainedUrl = src
    return {
      src,
      size,
      bytes: size.width * size.height * 4 + blob.size,
      dispose: () => {
        retained.src = ''
        URL.revokeObjectURL(retainedUrl)
      }
    }
  } catch (error) {
    if (decoded) {
      decoded.src = ''
    }
    if (src) {
      URL.revokeObjectURL(src)
    }
    throw error
  } finally {
    URL.revokeObjectURL(sourceUrl)
    if (image) {
      image.src = ''
    }
    if (!retainedCanvas) {
      canvas.width = 0
      canvas.height = 0
    }
  }
}
