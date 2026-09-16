import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ImageAsset } from '@shared/canvas/element-types'
import { prepareSvgBitmapDetail } from './svg-bitmap-detail'
import { svgBitmapCache } from './svg-bitmap-cache'

const asset: ImageAsset = {
  id: 'photo',
  mime: 'image/svg+xml',
  data: 'svg',
  width: 100,
  height: 50
}
const region = {
  crop: { x: 0.5, y: 0.4, width: 0.001, height: 0.002 },
  pixels: { width: 1000, height: 1000 }
}
function svg(content = '', attributes = ''): SVGSVGElement {
  return new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><defs><mask id="fade"><rect width="100%" height="100%" fill="white"/></mask></defs><g mask="url(#fade)" ${attributes}><image href="photo" width="100%" height="100%"/>${content}</g></svg>`,
    'image/svg+xml'
  ).documentElement as unknown as SVGSVGElement
}
function decoder(width = 100, height = 50) {
  const release = vi.fn()
  const image = { naturalWidth: width, naturalHeight: height } as HTMLImageElement
  const acquire = vi.spyOn(svgBitmapCache, 'acquire').mockReturnValue({
    ready: Promise.resolve(image),
    release
  })
  return { acquire, release, image }
}
afterEach(() => vi.restoreAllMocks())

describe('bounded masked photo detail', () => {
  it.each(['0 0 100 50', '0,0,100,50', ' 0  0  1e2  5e1 '])(
    'separates photo pixels and bounds mask allocation for viewBox %s',
    async (viewBox) => {
      const { image, release } = decoder()
      const root = svg()
      root.setAttribute('viewBox', viewBox)
      const prepared = await prepareSvgBitmapDetail(root, asset, 2, region)
      expect(prepared?.image).toBe(image)
      expect(root.querySelector('image')).toBeNull()
      expect(root.querySelector('mask')?.getAttribute('width')).toBe('0.001')
      expect(root.querySelector('mask')?.getAttribute('height')).toBe('0.002')
      expect(root.querySelector('g > rect')?.getAttribute('fill')).toBe('white')
      expect(release).not.toHaveBeenCalled()
      prepared?.release()
      expect(release).toHaveBeenCalledOnce()
    }
  )

  it.each([
    null,
    '',
    '0 0',
    '0 0 100',
    '0 0 100 50 1',
    '0 0 NaN 50',
    '0 0 100 NaN',
    '0 0 Infinity Infinity',
    '0 0 100 Infinity',
    '0 0 0 50',
    '0 0 100 0',
    '0 0 0 0',
    '0 0 -100 -50',
    '0 0 -100 50',
    '0 0 100 -50'
  ])('rejects invalid viewBox %s before decoding or changing the SVG', async (viewBox) => {
    const { acquire } = decoder()
    const root = svg()
    if (viewBox === null) {
      root.removeAttribute('viewBox')
    } else {
      root.setAttribute('viewBox', viewBox)
    }
    const original = root.outerHTML
    await expect(prepareSvgBitmapDetail(root, asset, 2, region)).resolves.toBeUndefined()
    expect(acquire).not.toHaveBeenCalled()
    expect(root.outerHTML).toBe(original)
  })

  it.each([
    ['<rect width="10" height="10"/>', ''],
    ['', 'transform="translate(1)"'],
    ['', 'filter="url(#blur)"'],
    ['', 'style="opacity:.5"'],
    ['', 'clip-path="url(#clip)"']
  ])(
    'retains the original renderer for unsupported geometry: %s %s',
    async (content, attributes) => {
      const { acquire } = decoder()
      const root = svg(content, attributes)
      expect(await prepareSvgBitmapDetail(root, asset, 2, region)).toBeUndefined()
      expect(acquire).not.toHaveBeenCalled()
      expect(root.querySelector('image')).not.toBeNull()
    }
  )

  it('preserves explicit mask regions and letterboxing', async () => {
    const { acquire, release } = decoder(50, 50)
    const root = svg()
    root.querySelector('mask')!.setAttribute('x', '.2')
    expect(await prepareSvgBitmapDetail(root, asset, 2, region)).toBeUndefined()
    expect(acquire).not.toHaveBeenCalled()
    expect(await prepareSvgBitmapDetail(svg(), asset, 1, region)).toBeUndefined()
    const letterboxed = svg()
    expect(await prepareSvgBitmapDetail(letterboxed, asset, 2, region)).toBeUndefined()
    expect(letterboxed.querySelector('image')).not.toBeNull()
    expect(release).toHaveBeenCalledOnce()
  })

  it('releases its source when the camera moves during decoding', async () => {
    const { release } = decoder()
    const controller = new AbortController()
    const root = svg()
    const prepared = prepareSvgBitmapDetail(root, asset, 2, region, controller.signal)
    controller.abort()
    await expect(prepared).rejects.toThrow()
    expect(release).toHaveBeenCalledOnce()
    expect(root.querySelector('image')).not.toBeNull()
  })
})
