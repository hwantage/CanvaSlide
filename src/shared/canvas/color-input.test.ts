import { describe, expect, it } from 'vitest'
import { isNoColor, normalizeHexColor, pushRecentColor } from './color-input'

describe('color-input', () => {
  it('normalizes hex forms and rejects anything else', () => {
    expect(normalizeHexColor('#ABCDEF')).toBe('#abcdef')
    expect(normalizeHexColor('abcdef')).toBe('#abcdef')
    expect(normalizeHexColor(' #fA0 ')).toBe('#ffaa00')
    expect(normalizeHexColor('#12345')).toBeNull()
    expect(normalizeHexColor('red')).toBeNull()
    expect(normalizeHexColor('none')).toBeNull()
  })

  it('keeps recent colours unique, newest first, and capped', () => {
    let recent: string[] = []
    for (const c of ['#111111', '#222222', '#111111', 'none']) {
      recent = pushRecentColor(recent, c, 2)
    }
    expect(recent).toEqual(['#111111', '#222222'])
    recent = pushRecentColor(recent, '#333333', 2)
    expect(recent).toEqual(['#333333', '#111111'])
  })

  it('recognizes the no-colour marker', () => {
    expect(isNoColor('none')).toBe(true)
    expect(isNoColor('transparent')).toBe(true)
    expect(isNoColor('#000000')).toBe(false)
  })
})
