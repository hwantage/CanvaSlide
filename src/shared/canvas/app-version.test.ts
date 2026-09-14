import { describe, expect, it } from 'vitest'
import { isNewerVersion, parseVersion } from './app-version'

describe('app-version', () => {
  it('parses with or without a v prefix and pads missing parts', () => {
    expect(parseVersion('v0.3.0')).toEqual([0, 3, 0])
    expect(parseVersion('1.2')).toEqual([1, 2, 0])
    expect(parseVersion('2.0.1-beta.3')).toEqual([2, 0, 1])
    expect(parseVersion('latest')).toBeNull()
  })

  it('compares numerically, not lexically', () => {
    expect(isNewerVersion('0.10.0', '0.9.9')).toBe(true)
    expect(isNewerVersion('0.3.0', '0.3.0')).toBe(false)
    expect(isNewerVersion('0.2.9', '0.3.0')).toBe(false)
    expect(isNewerVersion('v1.0.0', '0.99.0')).toBe(true)
    expect(isNewerVersion('nope', '0.3.0')).toBe(false)
  })
})
