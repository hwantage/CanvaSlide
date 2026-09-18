import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { insertElement } from '@shared/canvas/document-mutations'
import { createEmptyDocument, type FrameElement } from '@shared/canvas/element-types'
import { FrameListPanel } from '@/components/panels/frame-list-panel'
import { useDocumentStore } from '@/store/document-store'

const frame: FrameElement = {
  id: 'frame',
  type: 'frame',
  name: 'Original',
  order: 0,
  x: 0,
  y: 0,
  width: 400,
  height: 300
}

beforeEach(() => {
  useDocumentStore.getState().loadDocument(insertElement(createEmptyDocument(), frame), null)
})
afterEach(cleanup)

function rename() {
  const view = render(<FrameListPanel />)
  fireEvent.doubleClick(view.getByText('Original'))
  fireEvent.change(view.getByTestId('frame-name-editor'), { target: { value: 'Draft' } })
  return view
}

describe('shared frame name editor', () => {
  it('commits on unmount in the same document as a single undo step', () => {
    const view = rename()
    view.unmount()
    expect(useDocumentStore.getState().document.elements.frame).toMatchObject({ name: 'Draft' })
    expect(useDocumentStore.getState().past).toHaveLength(1)
    useDocumentStore.getState().undo()
    expect(useDocumentStore.getState().document.elements.frame).toMatchObject({ name: 'Original' })
  })

  it('discards the draft on Escape without adding history', () => {
    const view = rename()
    fireEvent.keyDown(view.getByTestId('frame-name-editor'), { key: 'Escape' })
    expect(view.queryByTestId('frame-name-editor')).toBeNull()
    expect(useDocumentStore.getState().past).toHaveLength(0)
    expect(useDocumentStore.getState().document.elements.frame).toMatchObject({ name: 'Original' })
  })

  it('never commits an old draft into a replacement document with the same frame id', () => {
    const view = rename()
    act(() => {
      useDocumentStore
        .getState()
        .loadDocument(insertElement(createEmptyDocument(), { ...frame, name: 'Replacement' }), null)
    })
    view.unmount()
    expect(useDocumentStore.getState().document.elements.frame).toMatchObject({
      name: 'Replacement'
    })
    expect(useDocumentStore.getState().dirty).toBe(false)
    expect(useDocumentStore.getState().past).toHaveLength(0)
  })

  it('ends renaming when a replacement document reuses the frame id', () => {
    const view = rename()
    act(() => {
      useDocumentStore
        .getState()
        .loadDocument(insertElement(createEmptyDocument(), { ...frame, name: 'Replacement' }), null)
    })
    expect(view.queryByTestId('frame-name-editor')).toBeNull()
    expect(view.getByTestId('frame-row').textContent).toContain('Replacement')
  })
})
