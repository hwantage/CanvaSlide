import { describe, expect, it } from 'vitest'
import {
  assetIdForData,
  assetsByteLength,
  createImageAsset,
  migrateDocumentV1,
  mimeOfDataUrl,
  pruneUnreferencedAssets,
  upsertAsset
} from './document-assets'
import { insertElement, removeElements, duplicateElements } from './document-mutations'
import {
  createEmptyDocument,
  defaultDocumentSettings,
  type CanvasDocumentV1
} from './element-types'

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

  it('migrates v1 inline images into the asset table, deduplicating', () => {
    const legacy: CanvasDocumentV1 = {
      version: 1,
      name: 'old',
      elements: {
        a: {
          id: 'a',
          type: 'image',
          src: PNG,
          naturalWidth: 1,
          naturalHeight: 1,
          x: 0,
          y: 0,
          width: 5,
          height: 5
        },
        b: {
          id: 'b',
          type: 'image',
          src: PNG,
          naturalWidth: 1,
          naturalHeight: 1,
          x: 9,
          y: 9,
          width: 5,
          height: 5
        },
        t: {
          id: 't',
          type: 'text',
          text: 'hi',
          x: 0,
          y: 0,
          width: 5,
          height: 5,
          textStyle: { color: '#000', fontSize: 12, align: 'left', bold: false }
        }
      },
      order: ['a', 'b', 't'],
      settings: { ...defaultDocumentSettings, transitionMs: 500 }
    }
    const migrated = migrateDocumentV1(legacy)
    expect(migrated.version).toBe(2)
    expect(Object.keys(migrated.assets)).toHaveLength(1)
    const a = migrated.elements.a
    expect(a?.type === 'image' && a.assetId === assetIdForData(PNG)).toBe(true)
    expect(a && 'src' in a).toBe(false)
    expect(migrated.elements.t).toEqual(legacy.elements.t)
  })
})
