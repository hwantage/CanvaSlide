import { describe, expect, it } from 'vitest'
import { PASTED_TEXT_MIN_WIDTH, normalizePastedText, pastedTextWidth } from './pasted-text'

describe('pasted-text', () => {
  it('normalizes CRLF and strips trailing newlines only', () => {
    expect(normalizePastedText('a\r\nb\rc\n\n')).toBe('a\nb\nc')
    expect(normalizePastedText('\n\nlead')).toBe('\n\nlead')
  })

  it('sizes the element to the longest line, bounded by the minimum and the viewport', () => {
    expect(pastedTextWidth('hi', 20, 1000)).toBe(PASTED_TEXT_MIN_WIDTH)
    expect(pastedTextWidth(`${'x'.repeat(50)}\nshort`, 20, 1000)).toBe(600)
    expect(pastedTextWidth('x'.repeat(500), 20, 800)).toBe(800)
    expect(pastedTextWidth('hi', 20, 100)).toBe(100)
  })
})
