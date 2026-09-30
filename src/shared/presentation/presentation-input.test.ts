import { afterEach, describe, expect, it } from 'vitest'
import { TEXT_LINK_CLASS } from '../canvas/text-links'
import { ownsPresentationPointer } from './presentation-input'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ownsPresentationPointer', () => {
  it('leaves a text link its click, so the gesture neither draws ink nor swipes', () => {
    document.body.innerHTML = `<div class="uc-text"><a class="${TEXT_LINK_CLASS}" href="https://example.com">x</a></div>`
    expect(ownsPresentationPointer(document.querySelector('a'))).toBe(true)
    expect(ownsPresentationPointer(document.querySelector('.uc-text'))).toBe(false)
  })
})
