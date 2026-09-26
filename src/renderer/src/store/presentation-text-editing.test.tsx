import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { insertElement } from '@shared/canvas/document-mutations'
import { createEmptyDocument, type TextElement } from '@shared/canvas/element-types'
import { EditableText } from '@/components/canvas/editable-text'
import { useCameraStore } from './camera-store'
import { useDocumentStore } from './document-store'
import { usePresentationStore } from './presentation-store'
import { useToolStore } from './tool-store'

vi.mock('@/platform/window-fullscreen', () => ({ setWindowFullscreen: vi.fn(async () => {}) }))

const text: TextElement = {
  id: 'text',
  type: 'text',
  x: 20,
  y: 20,
  width: 200,
  height: 40,
  text: 'Original',
  textStyle: { color: '#000000', fontSize: 24, align: 'left', bold: false }
}

function Editor() {
  const element = useDocumentStore((s) => s.document.elements.text) as TextElement
  const editing = useToolStore((s) => s.editingTextId === element.id)
  return (
    <EditableText
      elementId={element.id}
      text={element.text}
      style={element.textStyle}
      editing={editing}
      placeholder="Text"
    />
  )
}

beforeEach(() => {
  let document = insertElement(createEmptyDocument(), text)
  document = insertElement(document, {
    id: 'frame',
    type: 'frame',
    name: 'Frame',
    order: 0,
    x: 0,
    y: 0,
    width: 400,
    height: 300
  })
  document.settings.transitionMs = 0
  useDocumentStore.getState().loadDocument(document, null)
  useToolStore.getState().setEditingTextId(text.id)
  usePresentationStore.setState(usePresentationStore.getInitialState())
  useCameraStore.getState().setViewport({ width: 1000, height: 800 })
})

afterEach(() => {
  cleanup()
  useCameraStore.getState().cancelAnimation()
  useToolStore.setState(useToolStore.getInitialState())
  usePresentationStore.setState(usePresentationStore.getInitialState())
})

function editText() {
  const view = render(<Editor />)
  const editor = view.container.querySelector('.canvas-text-editor')!
  expect(document.activeElement).toBe(editor)
  fireEvent.input(editor, { target: { textContent: 'Draft' } })
  fireEvent.input(editor, { target: { textContent: 'Final text' } })
  expect(useDocumentStore.getState().past).toHaveLength(0)
  return view
}

describe('presentation text editing lifecycle', () => {
  it.each(['start', 'previewTransition'] as const)(
    '%s ends focused editing as one undo step',
    (entry) => {
      const view = editText()
      act(() => {
        const presentation = usePresentationStore.getState()
        if (entry === 'start') {
          presentation.start()
        } else {
          presentation.previewTransition('frame')
        }
      })
      expect(useToolStore.getState().editingTextId).toBeNull()
      expect(view.container.querySelector('.canvas-text-editor')).toBeNull()
      expect(usePresentationStore.getState().active).toBe(true)
      expect(useDocumentStore.getState().editBaseline).toBeNull()
      expect(useDocumentStore.getState().document.elements.text).toMatchObject({
        text: 'Final text'
      })
      expect(useDocumentStore.getState().past).toHaveLength(1)
      act(() => useDocumentStore.getState().undo())
      expect(useDocumentStore.getState().document.elements.text).toMatchObject({ text: 'Original' })
      expect(useDocumentStore.getState().past).toHaveLength(0)
      act(() => useDocumentStore.getState().redo())
      expect(useDocumentStore.getState().document.elements.text).toMatchObject({
        text: 'Final text'
      })
    }
  )

  it('ends editing on a start request without frames, preserving the F5 behavior', () => {
    useDocumentStore.getState().loadDocument(insertElement(createEmptyDocument(), text), null)
    editText()
    act(() => usePresentationStore.getState().start())
    expect(usePresentationStore.getState().active).toBe(false)
    expect(useToolStore.getState().editingTextId).toBeNull()
    expect(useDocumentStore.getState().past).toHaveLength(1)
  })

  it('keeps editing when the requested preview does not exist', () => {
    const view = editText()
    act(() => usePresentationStore.getState().previewTransition('missing'))
    expect(usePresentationStore.getState().active).toBe(false)
    expect(useToolStore.getState().editingTextId).toBe(text.id)
    expect(view.container.querySelector('.canvas-text-editor')).not.toBeNull()
    expect(useDocumentStore.getState().past).toHaveLength(0)
  })
})
