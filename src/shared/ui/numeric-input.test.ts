import { describe, expect, it } from 'vitest'
import { parseBoundedNumber } from './numeric-input'

describe('parseBoundedNumber', () => {
  it('returns null for empty or non-numeric input so the field can be cleared while typing', () => {
    expect(parseBoundedNumber('', 1, 10)).toBeNull()
    expect(parseBoundedNumber('   ', 1, 10)).toBeNull()
    expect(parseBoundedNumber('abc', 1, 10)).toBeNull()
    expect(parseBoundedNumber('-', 1, 10)).toBeNull()
  })

  it('clamps into the allowed range instead of storing invalid sizes', () => {
    expect(parseBoundedNumber('0', 1, 10)).toBe(1)
    expect(parseBoundedNumber('-5', 1, 10)).toBe(1)
    expect(parseBoundedNumber('99', 1, 10)).toBe(10)
    expect(parseBoundedNumber(' 7 ', 1, 10)).toBe(7)
    expect(parseBoundedNumber('2.5', 0, 10)).toBe(2.5)
  })
})
