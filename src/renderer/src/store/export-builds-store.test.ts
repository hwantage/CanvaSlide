import { beforeEach, describe, expect, it } from 'vitest'
import { createEmptyDocument } from '@shared/canvas/element-types'
import { useDocumentStore } from './document-store'
import { htmlBuildKey, useExportBuildsStore, type HtmlBuild } from './export-builds-store'

const build = (bytes: number): HtmlBuild => ({ html: 'x', bytes, fontBytes: 0, fontCount: 0 })
const store = () => useExportBuildsStore.getState()

describe('export builds', () => {
  beforeEach(() => {
    useExportBuildsStore.getState().clear()
  })

  it('hands back what it was given for the same document', () => {
    const doc = createEmptyDocument('Deck')
    store().rememberHtml(doc, htmlBuildKey('balanced', false), build(10))
    store().rememberPdf(doc, 'high', new Uint8Array([1, 2]))
    expect(store().source).toBe(doc)
    expect(store().html[htmlBuildKey('balanced', false)]?.bytes).toBe(10)
    expect(store().pdf.high).toEqual(new Uint8Array([1, 2]))
  })

  it('keeps every combination rather than only the latest', () => {
    const doc = createEmptyDocument('Deck')
    store().rememberHtml(doc, htmlBuildKey('original', false), build(30))
    store().rememberHtml(doc, htmlBuildKey('small', false), build(3))
    store().rememberPdf(doc, 'high', new Uint8Array([1]))
    store().rememberPdf(doc, 'low', new Uint8Array([2]))
    expect(store().html[htmlBuildKey('original', false)]?.bytes).toBe(30)
    expect(store().html[htmlBuildKey('small', false)]?.bytes).toBe(3)
    expect(store().pdf.high).toEqual(new Uint8Array([1]))
    expect(store().pdf.low).toEqual(new Uint8Array([2]))
  })

  it('separates builds made with fonts embedded from ones made without', () => {
    const doc = createEmptyDocument('Deck')
    store().rememberHtml(doc, htmlBuildKey('balanced', true), build(50))
    store().rememberHtml(doc, htmlBuildKey('balanced', false), build(5))
    expect(store().html[htmlBuildKey('balanced', true)]?.bytes).toBe(50)
    expect(store().html[htmlBuildKey('balanced', false)]?.bytes).toBe(5)
  })

  it('drops everything, both formats, once a build is for another document', () => {
    const first = createEmptyDocument('First')
    const second = createEmptyDocument('Second')
    store().rememberHtml(first, htmlBuildKey('balanced', false), build(10))
    store().rememberPdf(first, 'high', new Uint8Array([1]))
    store().rememberPdf(second, 'low', new Uint8Array([9]))
    expect(store().source).toBe(second)
    expect(store().html).toEqual({})
    expect(store().pdf.high).toBeUndefined()
    expect(store().pdf.low).toEqual(new Uint8Array([9]))
  })

  it('lets go as soon as the document is edited, without waiting to be asked again', () => {
    const doc = useDocumentStore.getState().document
    store().rememberPdf(doc, 'high', new Uint8Array([1]))
    store().rememberHtml(doc, htmlBuildKey('balanced', false), build(10))
    useDocumentStore.getState().applyEdit((current) => ({ ...current, name: 'Renamed' }))
    expect(store().source).toBeNull()
    expect(store().pdf).toEqual({})
    expect(store().html).toEqual({})
  })
})
