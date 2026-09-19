import { describe, expect, it } from 'vitest'
import { createImageAsset } from './document-assets'
import { bytesToBase64 } from './binary-data'
import { createAssetStorage, restoreStoredAsset } from './document-asset-storage'

const png = 'data:image/png;base64,AQIDBA=='
const svgUrl = (svg: string) =>
  `data:image/svg+xml;base64,${bytesToBase64(new TextEncoder().encode(svg))}`

describe('shared asset storage', () => {
  it('shares a bitmap across standalone images and distinct SVG crops without changing any bytes', () => {
    const originals = [
      createImageAsset(png, 20, 20),
      ...[1, 2].map((x) =>
        createImageAsset(
          svgUrl(
            `<svg><text>한글 😀</text><image x="${x}" href="${png}"/><image href='${png}'/></svg>`
          ),
          50,
          50
        )
      )
    ]
    const storage = createAssetStorage()
    const stored = originals.map(storage.store)
    expect(storage.resources.size).toBe(3)
    for (const [index, asset] of stored.entries()) {
      expect(
        restoreStoredAsset(
          asset,
          (id) => storage.resources.get(id)!.bytes,
          () => {}
        )
      ).toEqual(originals[index])
    }
  })

  it.each([
    'data:image/svg+xml,%3Csvg%2F%3E',
    'data:image/png;base64,AQIDBA',
    'data:image/png;base64,!!!!',
    'data:image/svg+xml;base64,77u/PHN2Zy8+',
    'data:image/svg+xml;base64,/w=='
  ])('preserves unusual legacy asset encodings: %s', (data) => {
    const storage = createAssetStorage()
    const original = createImageAsset(data, 1, 1)
    const stored = storage.store(original)
    expect(
      restoreStoredAsset(
        stored,
        (id) => storage.resources.get(id)!.bytes,
        () => {}
      )
    ).toEqual(original)
  })

  it('budgets reconstruction before expanding repeated references', () => {
    const storage = createAssetStorage()
    const stored = storage.store(
      createImageAsset(svgUrl(`<svg><image href="${png}"/></svg>`), 1, 1)
    )
    expect(() =>
      restoreStoredAsset(
        stored,
        (id) => storage.resources.get(id)!.bytes,
        () => {
          throw new Error('limit')
        }
      )
    ).toThrow('limit')
    if (stored.source.encoding !== 'svg') {
      throw new Error('expected SVG')
    }
    stored.source.images[0]!.offset = 100_000
    expect(() =>
      restoreStoredAsset(
        stored,
        (id) => storage.resources.get(id)!.bytes,
        () => {}
      )
    ).toThrow('offset')
  })
})
