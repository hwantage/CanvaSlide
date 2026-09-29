import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { insertElements } from '@shared/canvas/document-mutations'
import {
  createEmptyDocument,
  defaultTextStyle,
  type TextElement
} from '@shared/canvas/element-types'
import { useDocumentStore } from '@/store/document-store'
import { PropertiesPanel } from './properties-panel'
import { TextLinkField } from './text-link-field'

const text = (id: string, link?: string): TextElement => ({
  id,
  type: 'text',
  x: 0,
  y: 0,
  width: 200,
  height: 40,
  text: id,
  textStyle: defaultTextStyle,
  ...(link === undefined ? {} : { link })
})

function load(...elements: TextElement[]) {
  useDocumentStore.getState().loadDocument(insertElements(createEmptyDocument(), elements), null)
}

const linkOf = (id: string) => {
  const element = useDocumentStore.getState().document.elements[id]
  return element?.type === 'text' ? element.link : undefined
}

/** The field as the panel mounts it, following the stored link. */
function Field() {
  const link = useDocumentStore((state) => {
    const element = state.document.elements.t
    return element?.type === 'text' ? element.link : undefined
  })
  return <TextLinkField id="t" link={link} />
}

const field = () => screen.getByRole('textbox', { name: 'Link' }) as HTMLInputElement

function type(value: string, key?: string) {
  fireEvent.change(field(), { target: { value } })
  if (key) {
    fireEvent.keyDown(field(), { key })
  }
}

afterEach(cleanup)

describe('TextLinkField', () => {
  it('drops an invalid draft once undo and redo bring its link back', () => {
    load(text('t'))
    render(<Field />)
    type('example.com/one', 'Enter')
    expect(linkOf('t')).toBe('https://example.com/one')
    type('not a url', 'Enter')
    expect(screen.getByRole('alert')).toBeTruthy()
    // Each toolbar press renders the field in between, as a user's clicks do.
    act(() => useDocumentStore.getState().undo())
    expect(field().value).toBe('')
    act(() => useDocumentStore.getState().redo())
    expect(field().value).toBe('https://example.com/one')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('stores nothing typed before Escape, even when the field then unmounts', () => {
    load(text('t', 'https://example.com/kept'))
    const { unmount } = render(<Field />)
    type('example.com/typed', 'Escape')
    expect(field().value).toBe('https://example.com/kept')
    unmount()
    expect(linkOf('t')).toBe('https://example.com/kept')
  })

  it('leaves a link as written when the field is focused and left untouched', () => {
    load(text('t', 'https://Example.com'))
    const before = useDocumentStore.getState().document
    const { unmount } = render(<Field />)
    fireEvent.focus(field())
    fireEvent.blur(field())
    unmount()
    expect(useDocumentStore.getState().document).toBe(before)
    expect(useDocumentStore.getState().dirty).toBe(false)
  })
})

describe('PropertiesPanel', () => {
  it('shows the link field for one selected text only', () => {
    load(text('a'), text('b'))
    useDocumentStore.getState().setSelection(['a'])
    const { rerender } = render(<PropertiesPanel />)
    expect(screen.queryByRole('textbox', { name: 'Link' })).not.toBeNull()
    useDocumentStore.getState().setSelection(['a', 'b'])
    rerender(<PropertiesPanel />)
    expect(screen.queryByRole('textbox', { name: 'Link' })).toBeNull()
  })
})
