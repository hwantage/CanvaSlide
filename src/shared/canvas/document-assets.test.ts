import { describe, expect, it } from 'vitest'
import {
  assetIdForData,
  assetsByteLength,
  createImageAsset,
  mimeOfDataUrl,
  pruneUnreferencedAssets,
  upsertAsset
} from './document-assets'
import { insertElement, removeElements, duplicateElements } from './document-mutations'
import { createEmptyDocument } from './element-types'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk'
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsL'

describe('document-assets', () => {
  it('derives stable, content-addressed ids and mime types', () => {
    expect(assetIdForData(PNG)).toBe(assetIdForData(PNG))
    expect(assetIdForData(PNG)).not.toBe(assetIdForData(JPG))
    expect(assetIdForData(`${PNG}A`)).not.toBe(assetIdForData(`${PNG}B`))
    expect(mimeOfDataUrl(PNG)).toBe('image/png')
    expect(mimeOfDataUrl('nope')).toBe('application/octet-stream')
  })

  it('stores identical images once and shares them across duplicates', () => {
    const asset = createImageAsset(PNG, 1, 1)
    let doc = upsertAsset(createEmptyDocument(), asset)
    expect(upsertAsset(doc, createImageAsset(PNG, 1, 1))).toBe(doc)
    doc = insertElement(doc, {
      id: 'i1',
      type: 'image',
      assetId: asset.id,
      naturalWidth: 1,
      naturalHeight: 1,
      x: 0,
      y: 0,
      width: 10,
      height: 10
    })
    const { document } = duplicateElements(doc, ['i1'], () => 'i2')
    expect(Object.keys(document.assets)).toHaveLength(1)
    expect(assetsByteLength(document)).toBe(PNG.length)
  })

  it('prunes assets when their last element is removed', () => {
    const asset = createImageAsset(JPG, 2, 2)
    let doc = upsertAsset(createEmptyDocument(), asset)
    doc = insertElement(doc, {
      id: 'i1',
      type: 'image',
      assetId: asset.id,
      naturalWidth: 2,
      naturalHeight: 2,
      x: 0,
      y: 0,
      width: 10,
      height: 10
    })
    doc = insertElement(doc, { ...doc.elements.i1, id: 'i2' } as never)
    const one = removeElements(doc, ['i1'])
    expect(one.assets[asset.id]).toBeDefined()
    const none = removeElements(one, ['i2'])
    expect(none.assets).toEqual({})
    expect(pruneUnreferencedAssets(none)).toBe(none)
  })
})
