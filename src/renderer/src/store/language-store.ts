import { create } from 'zustand'
import { detectLocale, setLocale, type Locale } from '@/i18n/ui-strings'

export const languagePreferences = ['system', 'en', 'ko'] as const
export type LanguagePreference = (typeof languagePreferences)[number]

const STORAGE_KEY = 'canvaslide.language'

function isPreference(value: unknown): value is LanguagePreference {
  return languagePreferences.includes(value as LanguagePreference)
}

function readStored(): LanguagePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return isPreference(raw) ? raw : 'system'
  } catch {
    return 'system'
  }
}

/** What the OS/browser asks for; English where the webview cannot answer. */
export function systemLocale(): Locale {
  return detectLocale(typeof navigator === 'undefined' ? undefined : navigator.language)
}

export function resolveLanguage(preference: LanguagePreference, system: Locale): Locale {
  return preference === 'system' ? system : preference
}

/** Why: `lang` on <html> is what hyphenation, spell-check and screen readers go by. */
function applyLanguage(locale: Locale): void {
  setLocale(locale)
  document.documentElement.lang = locale
}

export type LanguageStore = {
  preference: LanguagePreference
  setPreference: (preference: LanguagePreference) => void
}

/** App-level language preference, persisted so a chosen language survives restarts. */
export const useLanguageStore = create<LanguageStore>()((set) => ({
  preference: readStored(),
  setPreference: (preference) => {
    set({ preference })
    try {
      localStorage.setItem(STORAGE_KEY, preference)
    } catch {
      // Why: private mode or a full quota must never block the switch itself.
    }
    applyLanguage(resolveLanguage(preference, systemLocale()))
  }
}))

/** Applies the stored choice before React renders, so nothing paints in the wrong language. */
export function syncLanguage(): void {
  applyLanguage(resolveLanguage(useLanguageStore.getState().preference, systemLocale()))
}

export const selectLanguagePreference = (s: LanguageStore): LanguagePreference => s.preference
export const selectLocale = (s: LanguageStore): Locale =>
  resolveLanguage(s.preference, systemLocale())
