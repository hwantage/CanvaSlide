import { expect, it } from 'vitest'
import { unzipSync } from 'fflate'
import { createEmptyDocument } from './element-types'
import { createImageAsset } from './document-assets'
import {
  createDocumentArchiveEncoder,
  type DocumentEncodingInput
} from './document-archive-encoder'
import { parseDocumentFile } from './document-archive'

function scene() {
  const document = createEmptyDocument()
  const bitmap = 'data:image/png;base64,AQIDBA=='
  for (const [index, data] of [
    bitmap,
    `data:image/svg+xml;base64,${btoa(`<svg><image href="${bitmap}"/></svg>`)}`
  ].entries()) {
    const asset = createImageAsset(data, 20, 20)
    const id = `image-${index}`
    document.assets[id] = asset
    document.elements[id] = {
      id,
      type: 'image',
      assetId: id,
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      naturalWidth: 20,
      naturalHeight: 20
    }
    document.order.push(id)
  }
  return document
}

function unchanged(document: ReturnType<typeof scene>): DocumentEncodingInput {
  return {
    ...document,
    assets: Object.fromEntries(
      Object.entries(document.assets).map(([id, { data: _data, ...asset }]) => [id, asset])
    )
  }
}

it('reuses unchanged resources while saving edits and asset metadata', () => {
  const encode = createDocumentArchiveEncoder()
  const document = scene()
  encode(document)
  document.name = 'Edited'
  document.assets['image-0'] = { ...document.assets['image-0']!, width: 30 }
  expect(parseDocumentFile(encode(unchanged(document)))).toEqual({ ok: true, document })
  document.assets['image-0'] = createImageAsset('data:image/png;base64,BQYHCA==', 20, 20)
  const update = unchanged(document)
  update.assets['image-0'] = document.assets['image-0']!
  expect(parseDocumentFile(encode(update))).toEqual({ ok: true, document })
})

it('prunes unused cached resources and accepts restored assets after undo', () => {
  const encode = createDocumentArchiveEncoder()
  const document = scene()
  encode(document)
  const empty = encode(createEmptyDocument())
  expect(Object.keys(unzipSync(empty))).toEqual(['document.json'])
  expect(() => encode(unchanged(document))).toThrow('Missing cached')
  expect(parseDocumentFile(encode(document))).toEqual({ ok: true, document })
})

it('does not lose the last successful cache when an encode fails', () => {
  const encode = createDocumentArchiveEncoder()
  const document = scene()
  encode(document)
  const broken = unchanged(document)
  delete broken.assets['image-0']
  expect(() => encode(broken)).toThrow('Missing document image')
  expect(parseDocumentFile(encode(unchanged(document)))).toEqual({ ok: true, document })
})
