import { en } from './locales/en'
import { ko } from './locales/ko'
import { createTranslator, type Locale, type Translator } from './translator'

export type { Locale }
export type UiStringKey = keyof typeof en
export type UiStrings = Record<UiStringKey, string>

export const locales: Record<Locale, UiStrings> = { en, ko }
export const defaultLocale: Locale = 'en'

/** Maps a BCP 47 tag (navigator.language) to a supported locale; unknown languages fall back to English. */
export function detectLocale(languageTag: string | undefined): Locale {
  const language = (languageTag ?? '').toLowerCase().split('-')[0]
  return language === 'ko' ? 'ko' : defaultLocale
}

let current: Locale = detectLocale(
  typeof navigator === 'undefined' ? undefined : navigator.language
)

export function currentLocale(): Locale {
  return current
}

/** Tests and a future language setting switch here; components read strings on render. */
export function setLocale(locale: Locale): void {
  current = locale
}

export const { t, tn }: Translator<UiStringKey> = createTranslator(locales, currentLocale)

/** The app's strings in a fixed language, for a host that keeps its own language (the website). */
export function uiStringsIn(locale: Locale): Translator<UiStringKey> {
  return createTranslator(locales, () => locale)
}
