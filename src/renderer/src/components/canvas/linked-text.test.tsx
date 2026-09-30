import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openExternalUrl } from '@/platform/external-links'
import { LinkedText } from './linked-text'

vi.mock('@/platform/external-links', () => ({ openExternalUrl: vi.fn(async () => {}) }))

afterEach(() => {
  cleanup()
  vi.mocked(openExternalUrl).mockClear()
})

function anchor(active: boolean, link?: string): HTMLAnchorElement {
  const { container } = render(
    <LinkedText text="Docs at https://example.com/docs." link={link} active={active} />
  )
  return container.querySelector('a') as HTMLAnchorElement
}

describe('LinkedText', () => {
  it('opens a link through the platform while presenting', () => {
    const link = anchor(true)
    expect(fireEvent.click(link)).toBe(false)
    expect(openExternalUrl).toHaveBeenCalledWith('https://example.com/docs')
    expect(link.style.pointerEvents).toBe('auto')
    expect(link.style.cursor).toBe('pointer')
  })

  it('opens a middle-clicked link through the platform, and ignores other buttons', () => {
    const link = anchor(true)
    const auxclick = (button: number) =>
      link.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, cancelable: true, button }))
    expect(auxclick(2)).toBe(true)
    expect(openExternalUrl).not.toHaveBeenCalled()
    expect(auxclick(1)).toBe(false)
    expect(openExternalUrl).toHaveBeenCalledExactlyOnceWith('https://example.com/docs')
  })

  it('opens the canonical form, which the desktop opener allows', () => {
    const { container } = render(
      <LinkedText text="Demo: HTTPS://EXAMPLE.COM/Demo" link={undefined} active />
    )
    fireEvent.click(container.querySelector('a')!)
    expect(openExternalUrl).toHaveBeenCalledWith('https://example.com/Demo')
  })

  it('never takes focus, so the slide keys stay with the presentation', () => {
    for (const active of [true, false]) {
      const link = anchor(active)
      expect(link.tabIndex).toBe(-1)
      expect(fireEvent.mouseDown(link)).toBe(false)
      cleanup()
    }
  })

  it('opens the element link rather than a URL in its text', () => {
    fireEvent.click(anchor(true, 'https://example.com/'))
    expect(openExternalUrl).toHaveBeenCalledWith('https://example.com/')
  })

  it('never follows a link while editing', () => {
    const link = anchor(false)
    expect(fireEvent.click(link)).toBe(false)
    fireEvent(link, new MouseEvent('auxclick', { bubbles: true, button: 1 }))
    expect(openExternalUrl).not.toHaveBeenCalled()
    expect(link.style.pointerEvents).toBe('')
  })
})
