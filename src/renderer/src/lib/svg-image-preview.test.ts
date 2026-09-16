import { describe, expect, it, vi } from 'vitest'
import { createSvgImagePreview, staticMaskedSvg } from './svg-image-preview'

const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
function svg(extra = '', image = png) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1602 981"><defs><mask id="fade"><rect width="100%" height="100%" fill="white"/></mask></defs><image href="${image}" width="100%" height="100%" mask="url(#fade)"/>${extra}</svg>`)}`
}

describe('static masked bitmap SVG detection', () => {
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
