import { describe, expect, it } from 'vitest'
import { presentationKeyAction } from './presentation-keys'

describe('presentationKeyAction', () => {
  it('maps every navigation key the app and the player both honour', () => {
    for (const key of ['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter']) {
      expect(presentationKeyAction(key)).toBe('next')
    }
    for (const key of ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace']) {
      expect(presentationKeyAction(key)).toBe('previous')
    }
    expect(presentationKeyAction('o')).toBe('toggleOverview')
    expect(presentationKeyAction('O')).toBe('toggleOverview')
    expect(presentationKeyAction('Escape')).toBe('escape')
  })

  it('maps the pen key to the one pointer, in either case', () => {
    expect(presentationKeyAction('p')).toBe('togglePointer')
    expect(presentationKeyAction('P')).toBe('togglePointer')
    expect(presentationKeyAction('e')).toBe('clearInk')
    expect(presentationKeyAction('E')).toBe('clearInk')
  })

  it('leaves editor keys alone', () => {
    for (const key of ['a', 'l', 'L', 'Delete', 'Tab', 'F2', '?']) {
      expect(presentationKeyAction(key)).toBeNull()
    }
  })

  it('uses physical letter keys when the input layout does not produce Latin letters', () => {
    expect(presentationKeyAction('ㅔ', { code: 'KeyP' })).toBe('togglePointer')
    expect(presentationKeyAction('ㄷ', { code: 'KeyE' })).toBe('clearInk')
    expect(presentationKeyAction('ㅐ', { code: 'KeyO' })).toBe('toggleOverview')
    expect(presentationKeyAction('Process', { code: 'KeyP', composing: true })).toBe(
      'togglePointer'
    )
    expect(presentationKeyAction('p', { code: 'KeyQ' })).toBe('togglePointer')
    expect(presentationKeyAction('a', { code: 'KeyA' })).toBeNull()
  })

  it('does not interpret IME confirmation or cancellation as presentation navigation', () => {
    for (const key of ['Enter', 'Escape', ' ', 'ArrowRight', 'Backspace', 'Tab', 'p']) {
      expect(presentationKeyAction(key, { composing: true })).toBeNull()
    }
  })
})
