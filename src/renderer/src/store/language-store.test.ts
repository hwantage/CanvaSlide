import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentLocale, setLocale } from '@/i18n/ui-strings'
import { resolveLanguage, syncLanguage, useLanguageStore } from './language-store'

const STORAGE_KEY = 'canvaslide.language'

function reset() {
  localStorage.clear()
  useLanguageStore.setState({ preference: 'system' })
  setLocale('en')
}

beforeEach(() => reset())
afterEach(() => setLocale('en'))

describe('resolveLanguage', () => {
  it('follows the system in system mode', () => {
    expect(resolveLanguage('system', 'ko')).toBe('ko')
    expect(resolveLanguage('system', 'en')).toBe('en')
  })

  it('ignores the system for an explicit choice', () => {
    expect(resolveLanguage('ko', 'en')).toBe('ko')
    expect(resolveLanguage('en', 'ko')).toBe('en')
  })
})

describe('useLanguageStore', () => {
  it('switches the strings and the document language', () => {
    useLanguageStore.getState().setPreference('ko')
    expect(currentLocale()).toBe('ko')
    expect(document.documentElement.lang).toBe('ko')
  })

  it('persists the preference', () => {
    useLanguageStore.getState().setPreference('ko')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('ko')
    expect(useLanguageStore.getState().preference).toBe('ko')
  })

  it('applies the stored choice on startup', () => {
    useLanguageStore.setState({ preference: 'ko' })
    syncLanguage()
    expect(currentLocale()).toBe('ko')
  })

  it('keeps working when storage is unavailable', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => useLanguageStore.getState().setPreference('ko')).not.toThrow()
    expect(currentLocale()).toBe('ko')
    setItem.mockRestore()
  })
})
