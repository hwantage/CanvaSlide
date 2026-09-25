import { describe, expect, it, vi } from 'vitest'
import { createSvgImagePreview } from './svg-image-preview'
import { rasterizeSvg } from './svg-raster'

vi.mock(import('./svg-raster'), async (importOriginal) => ({
  ...(await importOriginal()),
  rasterizeSvg: vi.fn()
}))

const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
const webp = 'UklGRh4AAABXRUJQVlA4TBEAAAAvAUAAEAdQy8oUuYCBiOh/AAA='
const animatedWebp =
  'UklGRtAAAABXRUJQVlA4WAoAAAASAAAAAQAAAQAAQU5JTQYAAAAAAAAAAABBTk1GVAAAAAAAAAAAAAEAAAEAAGQAAAJBTFBIBQAAAACAgICAAFZQOCAuAAAAMAEAnQEqAgACAAFAJiWgAANwAP6uF//+Zo/7zf95vav//9NI//ppH/9NI+U0AEFOTUZIAAAAAAAAAAAAAQAAAQAAZAAAAFZQOCAwAAAANAEAnQEqAgACAAAAJiWgAANwAP7E7///Ngf+Qf/IPv9//+k2f/0mz/+k2fHMAAAA'
function svg(extra = '', image = png) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1602 981"><defs><mask id="fade"><rect width="100%" height="100%" fill="white"/></mask></defs><image href="${image}" width="100%" height="100%" mask="url(#fade)"/>${extra}</svg>`)}`
}

/** The SVG a camera-flight preview rasterizes, or null when the original stays in place. */
async function motionRaster(data: string): Promise<SVGSVGElement | null> {
  vi.mocked(rasterizeSvg).mockResolvedValue({ src: 'blob:preview', bytes: 0, dispose: vi.fn() })
  try {
    await createSvgImagePreview(
      { id: 'photo', mime: 'image/svg+xml', data, width: 1602, height: 981 },
      2
    )
    return vi.mocked(rasterizeSvg).mock.calls[0]?.[0] ?? null
  } finally {
    vi.mocked(rasterizeSvg).mockReset()
  }
}

describe('static masked bitmap SVG detection', () => {
  it('rasterizes a masked lossless WebP into a bounded camera-flight preview', async () => {
    const data = svg('', `data:image/webp;base64,${webp}`)
    const preview = { src: 'blob:photo', bytes: 128, dispose: vi.fn() }
    vi.mocked(rasterizeSvg).mockResolvedValue(preview)
    try {
      expect(
        await createSvgImagePreview(
          { id: 'photo', mime: 'image/svg+xml', data, width: 1602, height: 981 },
          2
        )
      ).toBe(preview)
      expect(rasterizeSvg).toHaveBeenCalledOnce()
      expect(vi.mocked(rasterizeSvg).mock.calls[0]![1]).toEqual({ width: 1602, height: 801 })
    } finally {
      vi.mocked(rasterizeSvg).mockReset()
    }
  })

  it.each([
    ['animated WebP', `data:image/webp;base64,${animatedWebp}`],
    ['animated WebP with surrounding whitespace', ` data:image/webp;base64,${animatedWebp} `],
    [
      'animated WebP with whitespace before its MIME type',
      `data: image/webp;base64,${animatedWebp}`
    ],
    ['animated WebP with whitespace in the MIME label', `data:image/webp ;base64,${animatedWebp}`],
    ['truncated WebP', `data:image/webp;base64,${webp.slice(0, -4)}`],
    ['invalid base64', 'data:image/webp;base64,?'],
    ['MIME label alone', 'data:image/webp;base64,'],
    ['invalid encoding label', `data:image/webp;notbase64,${webp}`],
    ['unsupported encoding', 'data:image/webp,RIFF']
  ])('keeps %s live during motion and detail rendering', async (_, image) => {
    const data = svg('', image)
    const asset = { id: 'photo', mime: 'image/svg+xml', data, width: 1602, height: 981 }
    expect((await createSvgImagePreview(asset, 2)).src).toBe(data)
    expect(
      (
        await createSvgImagePreview(asset, 2, {
          crop: { x: 0, y: 0, width: 0.5, height: 1 },
          pixels: { width: 512, height: 512 }
        })
      ).src
    ).toBe(data)
    expect(rasterizeSvg).not.toHaveBeenCalled()
  })

  it('skips unrelated bitmap decoding when vector content rules out a photo preview', async () => {
    const data = svg('<text>Sharp caption</text>')
    const decode = vi.spyOn(globalThis, 'atob')
    try {
      expect(
        (
          await createSvgImagePreview(
            { id: 'captioned', mime: 'image/svg+xml', data, width: 1602, height: 981 },
            2
          )
        ).src
      ).toBe(data)
      expect(decode).not.toHaveBeenCalled()
    } finally {
      decode.mockRestore()
    }
  })

  it('rejects a masked PNG with invalid base64 without throwing', async () => {
    expect(await motionRaster(svg('', 'data:image/png;base64,?'))).toBeNull()
  })

  it('falls back to the original masked SVG when its PNG cannot be decoded', async () => {
    const data = svg('', 'data:image/png;base64,?')
    await expect(
      createSvgImagePreview(
        { id: 'invalid-masked-photo', mime: 'image/svg+xml', data, width: 1602, height: 981 },
        2
      )
    ).resolves.toMatchObject({ src: data })
    expect(rasterizeSvg).not.toHaveBeenCalled()
  })

  it('keeps vector detail available when an unrelated embedded PNG cannot be decoded', async () => {
    const data = svg('<text>Sharp caption</text>', 'data:image/png;base64,?')
    const preview = { src: 'blob:caption', bytes: 128, dispose: vi.fn() }
    vi.mocked(rasterizeSvg).mockResolvedValue(preview)
    try {
      expect(
        await createSvgImagePreview(
          { id: 'captioned-invalid-photo', mime: 'image/svg+xml', data, width: 1602, height: 981 },
          2,
          { crop: { x: 0, y: 0, width: 1, height: 1 }, pixels: { width: 512, height: 256 } }
        )
      ).toBe(preview)
    } finally {
      vi.mocked(rasterizeSvg).mockReset()
    }
  })

  it('preserves an unmasked animated WebP alongside a still image when requesting detail', async () => {
    const data = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><image href="${png}" width="100" height="100"/><image href="data:image/webp;base64,${animatedWebp}" x="100" width="100" height="100"/></svg>`)}`
    const preview = await createSvgImagePreview(
      { id: 'mixed', mime: 'image/svg+xml', data, width: 200, height: 100 },
      2,
      { crop: { x: 0, y: 0, width: 1, height: 1 }, pixels: { width: 400, height: 200 } }
    )
    expect(preview.src).toBe(data)
    expect(rasterizeSvg).not.toHaveBeenCalled()
  })

  it('decodes a WebP container once across motion and repeated detail requests', async () => {
    const data = svg('<text>Sharp caption</text>', `data:image/webp;base64,${webp}`)
    const asset = { id: 'captioned-webp', mime: 'image/svg+xml', data, width: 1602, height: 981 }
    const decode = vi.spyOn(globalThis, 'atob')
    vi.mocked(rasterizeSvg).mockResolvedValue({ src: 'blob:crop', bytes: 0, dispose: vi.fn() })
    try {
      expect((await createSvgImagePreview(asset, 2)).src).toBe(data)
      for (const x of [0, 0.5]) {
        await createSvgImagePreview(asset, 2, {
          crop: { x, y: 0, width: 0.5, height: 1 },
          pixels: { width: 512, height: 512 }
        })
      }
      expect(decode).toHaveBeenCalledOnce()
      expect(decode).toHaveBeenCalledWith(webp)
    } finally {
      decode.mockRestore()
      vi.mocked(rasterizeSvg).mockReset()
    }
  })

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

  it('accepts masked photos with percent-encoded and base64 SVG data', async () => {
    expect((await motionRaster(svg()))?.getAttribute('viewBox')).toBe('0 0 1602 981')
    const text = decodeURIComponent(svg().split(',')[1]!)
    expect(await motionRaster(`data:image/svg+xml;base64,${btoa(text)}`)).not.toBeNull()
  })

  it.each([
    '<animate attributeName="opacity" dur="1s"/>',
    '<animateMotion dur="1s"/>',
    '<style>@keyframes fade { to { opacity: 0 } }</style>',
    '<text>Sharp at every zoom</text>',
    '<foreignObject/>'
  ])('preserves dynamic or vector content: %s', async (extra) => {
    expect(await motionRaster(svg(extra))).toBeNull()
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

  it('keeps external images and animated bitmap formats in the original renderer', async () => {
    expect(await motionRaster(svg('', 'https://example.com/photo.png'))).toBeNull()
    expect(await motionRaster(svg('', 'data:image/gif;base64,R0lGODlh'))).toBeNull()
    const apngHeader = btoa('\x89PNG\r\n\x1a\n' + '\0\0\0\0acTL' + '\0\0\0\0' + '\0\0\0\0IDAT')
    expect(await motionRaster(svg('', `data:image/png;base64,${apngHeader}`))).toBeNull()
  })

  it('preserves SVGs without scalable coordinates instead of cropping their contents', async () => {
    const source = decodeURIComponent(svg().split(',')[1]!)
    for (const viewBox of ['', 'viewBox="0 0 -1602 981"', 'viewBox="0 0 invalid 981"']) {
      const data = source.replace('viewBox="0 0 1602 981"', viewBox)
      expect(await motionRaster(`data:image/svg+xml;base64,${btoa(data)}`)).toBeNull()
    }
  })
})
