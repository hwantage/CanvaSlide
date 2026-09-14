import { describe, expect, it } from 'vitest'
import { fontFamilyIds, fontStackFor, isFontFamilyId, quoteFontFamily } from './font-family'

describe('font-family', () => {
  it('maps every non-default preset to a stack that ends in a generic family', () => {
    for (const id of fontFamilyIds) {
      const stack = fontStackFor(id)
      if (id === 'default') {
        expect(stack).toBeUndefined()
      } else {
        expect(stack).toMatch(/(sans-serif|serif|monospace|cursive)$/)
      }
    }
  })

  it('turns an installed family name into a quoted stack with a sans fallback', () => {
    expect(fontStackFor('Nanum Gothic')).toBe(`"Nanum Gothic", ${fontStackFor('sans')}`)
    expect(quoteFontFamily('Odd "Quote" \\ Font')).toBe('"Odd \\"Quote\\" \\\\ Font"')
    expect(isFontFamilyId('Nanum Gothic')).toBe(false)
  })

  it('treats empty or default values as inherited', () => {
    expect(fontStackFor(undefined)).toBeUndefined()
    expect(fontStackFor('')).toBeUndefined()
    expect(fontStackFor('default')).toBeUndefined()
  })
})
