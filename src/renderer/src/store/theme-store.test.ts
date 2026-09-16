import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveTheme, useThemeStore, type ThemeStore } from './theme-store'

const STORAGE_KEY = 'canvaslide.theme'

function reset(initial: Partial<ThemeStore> = {}) {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  useThemeStore.setState({ preference: 'system', systemDark: false, ...initial })
}

describe('resolveTheme', () => {
  it('follows the OS in system mode', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('ignores the OS for an explicit preference', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('useThemeStore', () => {
  beforeEach(() => reset())

  it('writes the resolved theme onto the document element', () => {
    useThemeStore.getState().setPreference('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    useThemeStore.getState().setPreference('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('persists the preference', () => {
    useThemeStore.getState().setPreference('dark')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
    expect(useThemeStore.getState().preference).toBe('dark')
  })

  it('reacts to an OS change only while on system', () => {
    useThemeStore.getState().setSystemDark(true)
    expect(document.documentElement.dataset.theme).toBe('dark')

    useThemeStore.getState().setPreference('light')
    useThemeStore.getState().setSystemDark(false)
    expect(document.documentElement.dataset.theme).toBe('light')
    useThemeStore.getState().setSystemDark(true)
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('keeps working when storage is unavailable', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => useThemeStore.getState().setPreference('dark')).not.toThrow()
    expect(document.documentElement.dataset.theme).toBe('dark')
    setItem.mockRestore()
  })
})

describe('stored preference on boot', () => {
  beforeEach(() => {
    vi.resetModules()
    reset()
  })

  it('restores a saved preference', async () => {
    localStorage.setItem(STORAGE_KEY, 'dark')
    const { useThemeStore: fresh, syncTheme } = await import('./theme-store')
    expect(fresh.getState().preference).toBe('dark')
    syncTheme()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('falls back to system for an unknown stored value', async () => {
    localStorage.setItem(STORAGE_KEY, 'neon')
    const { useThemeStore: fresh } = await import('./theme-store')
    expect(fresh.getState().preference).toBe('system')
  })
})
