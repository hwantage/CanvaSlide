import { expect, it } from 'vitest'
import { serializeDocumentArchive, parseDocumentFile } from '@shared/canvas/document-archive'
import { createImageAsset } from '@shared/canvas/document-assets'
import { createEmptyDocument } from '@shared/canvas/element-types'
import { useDocumentStore } from './document-store'

it('duplicates, deletes and undoes restored SVG assets without losing their nested bitmap', () => {
  const doc = createEmptyDocument()
  const data = `data:image/svg+xml;base64,${btoa('<svg><image href="data:image/png;base64,AQIDBA=="/></svg>')}`
  const asset = createImageAsset(data, 10, 10)
  doc.assets[asset.id] = asset
  doc.elements.image = {
    id: 'image',
    type: 'image',
    assetId: asset.id,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    naturalWidth: 10,
    naturalHeight: 10
  }
  doc.order = ['image']
  const opened = parseDocumentFile(serializeDocumentArchive(doc))
  if (!opened.ok) {
    throw new Error(opened.error)
  }
  const store = useDocumentStore.getState()
  store.loadDocument(opened.document, null)
  store.setSelection(['image'])
  store.duplicateSelected()
  expect(Object.keys(useDocumentStore.getState().document.assets)).toHaveLength(1)
  store.deleteSelected()
  store.setSelection(['image'])
  store.deleteSelected()
  expect(useDocumentStore.getState().document.assets).toEqual({})
  store.undo()
  expect(parseDocumentFile(serializeDocumentArchive(useDocumentStore.getState().document))).toEqual(
    { ok: true, document: doc }
  )
})
