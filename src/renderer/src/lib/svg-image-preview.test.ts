import { describe, expect, it, vi } from 'vitest'
import { createSvgImagePreview, staticMaskedSvg } from './svg-image-preview'
import { rasterizeSvg } from './svg-raster'

vi.mock(import('./svg-raster'), async (importOriginal) => ({
  ...(await importOriginal()),
  rasterizeSvg: vi.fn()
}))

const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
function svg(extra = '', image = png) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1602 981"><defs><mask id="fade"><rect width="100%" height="100%" fill="white"/></mask></defs><image href="${image}" width="100%" height="100%" mask="url(#fade)"/>${extra}</svg>`)}`
}

describe('static masked bitmap SVG detection', () => {
  it('parses a source once and isolates the mutable viewport of each detail crop', async () => {
    const data = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><text>Vector caption</text></svg>')}`
    const asset = { id: 'vector', mime: 'image/svg+xml', data, width: 200, height: 100 }
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString')
    vi.mocked(rasterizeSvg).mockResolvedValue({ src: 'blob:crop', bytes: 0, dispose: vi.fn() })
    try {
      for (const aspect of [2, 1]) {
        await createSvgImagePreview(asset, aspect, {
          crop: { x: 0, y: 0, width: 0.5, height: 1 },
          pixels: { width: 512, height: 512 }
        })
      }
      expect(parse).toHaveBeenCalledOnce()
      const crops = vi.mocked(rasterizeSvg).mock.calls.map(([crop]) => crop)
      expect(crops[0]!.getAttribute('viewBox')).toBe('0 0 100 100')
      expect(crops[1]!.getAttribute('viewBox')).toBe('0 0 100 200')
      expect(crops[0]!.firstElementChild?.getAttribute('height')).toBe('100')
      expect(crops[1]!.firstElementChild?.getAttribute('height')).toBe('200')
      expect(parse.mock.results[0]!.value.documentElement.hasAttribute('height')).toBe(false)
    } finally {
      parse.mockRestore()
      vi.mocked(rasterizeSvg).mockReset()
    }
  })

  it('leaves vector text and animation in a single SVG renderer instead of predecoding a second one', async () => {
    const image = vi.fn(function UnusedImage() {
      throw new Error('Unexpected SVG decoder')
    })
    vi.stubGlobal('Image', image)
    try {
      for (const extra of [
        '<text>Vector caption</text>',
        '<animate attributeName="opacity" dur="1s"/>'
      ]) {
        const data = svg(extra)
        const result = await createSvgImagePreview(
          { id: 'svg', mime: 'image/svg+xml', data, width: 1602, height: 981 },
          2
        )
        expect(result.src).toBe(data)
      }
      expect(image).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('accepts masked photos with percent-encoded and base64 SVG data', () => {
    expect(staticMaskedSvg(svg())?.getAttribute('viewBox')).toBe('0 0 1602 981')
    const text = decodeURIComponent(svg().split(',')[1]!)
    expect(staticMaskedSvg(`data:image/svg+xml;base64,${btoa(text)}`)).not.toBeNull()
  })

  it.each([
    '<animate attributeName="opacity" dur="1s"/>',
    '<animateMotion dur="1s"/>',
    '<style>@keyframes fade { to { opacity: 0 } }</style>',
    '<text>Sharp at every zoom</text>',
    '<foreignObject/>'
  ])('preserves dynamic or vector content: %s', (extra) => {
    expect(staticMaskedSvg(svg(extra))).toBeNull()
  })

  it('keeps CSS animation live for every detail crop and caches its rejection', async () => {
    const data = svg(
      '<style>@keyframes fade { to { opacity: 0 } } image { animation: fade 1s infinite }</style>'
    )
    const asset = { id: 'animated', mime: 'image/svg+xml', data, width: 1602, height: 981 }
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString')
    const image = vi.fn(function UnusedImage() {
      throw new Error('Unexpected SVG decoder')
    })
    vi.stubGlobal('Image', image)
    try {
      for (const x of [0, 0.5]) {
        const result = await createSvgImagePreview(asset, 2, {
          crop: { x, y: 0, width: 0.5, height: 1 },
          pixels: { width: 512, height: 512 }
        })
        expect(result.src).toBe(data)
      }
      expect(parse).toHaveBeenCalledOnce()
      expect(image).not.toHaveBeenCalled()
    } finally {
      parse.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  it('keeps external images and animated bitmap formats in the original renderer', () => {
    expect(staticMaskedSvg(svg('', 'https://example.com/photo.png'))).toBeNull()
    expect(staticMaskedSvg(svg('', 'data:image/gif;base64,R0lGODlh'))).toBeNull()
    const apngHeader = btoa('\x89PNG\r\n\x1a\n' + '\0\0\0\0acTL' + '\0\0\0\0' + '\0\0\0\0IDAT')
    expect(staticMaskedSvg(svg('', `data:image/png;base64,${apngHeader}`))).toBeNull()
  })

  it('preserves SVGs without scalable coordinates instead of cropping their contents', () => {
    const source = decodeURIComponent(svg().split(',')[1]!)
    for (const viewBox of ['', 'viewBox="0 0 -1602 981"', 'viewBox="0 0 invalid 981"']) {
      const data = source.replace('viewBox="0 0 1602 981"', viewBox)
      expect(staticMaskedSvg(`data:image/svg+xml;base64,${btoa(data)}`)).toBeNull()
    }
  })
})
