import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultTextStyle } from '@shared/canvas/element-types'
import { EditableText } from './editable-text'

afterEach(cleanup)

describe('EditableText', () => {
  it.each([
    ['plain text', 'Design references\n', undefined],
    ['text with a URL', 'See https://example.com/docs.', undefined],
    ['linked text', 'Open demo', { link: 'https://example.com/', active: false }]
  ])('draws %s once after editing ends', (_, text, links) => {
    const view = (editing: boolean) => (
      <EditableText
        elementId="text"
        text={text}
        style={defaultTextStyle}
        editing={editing}
        placeholder=""
        links={links ?? { link: undefined, active: false }}
      />
    )
    const { container, rerender } = render(view(true))
    const editor = container.querySelector('[contenteditable]')!
    expect(editor.textContent).toBe(text)
    // What typing and Enter leave behind: text nodes and a break React never rendered.
    editor.append(document.createElement('br'), 'typed')
    rerender(view(false))
    expect(container.querySelector('[contenteditable]')).toBeNull()
    expect(container.firstElementChild!.textContent).toBe(text)
  })
})
