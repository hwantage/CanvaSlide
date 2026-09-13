import { en } from './locales/en'
import { ko } from './locales/ko'

export type UiStringKey = keyof typeof en
export type UiStrings = Record<UiStringKey, string>
export type Locale = 'en' | 'ko'

// Why: a generic parameter is needed for the conditional to distribute over the key union.
type PluralBase<K> = K extends `${infer Base}.one`
  ? `${Base}.other` extends UiStringKey
    ? Base
    : never
  : never
/** Keys that come in `.one` / `.other` pairs, addressed by their base for `tn()`. */
export type PluralKey = PluralBase<UiStringKey>

type Params = Record<string, string | number>

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

export function interpolate(template: string, params?: Params): string {
  if (!params) {
    return template
  }
  return template.replaceAll(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  )
}

export function t(key: UiStringKey, params?: Params): string {
  return interpolate(locales[current][key], params)
}

/** Picks `${key}.one` for exactly one, `${key}.other` otherwise; `{n}` is filled with the count. */
export function tn(key: PluralKey, count: number, params?: Params): string {
  const form: UiStringKey = `${key}.${count === 1 ? 'one' : 'other'}`
  return t(form, { n: count, ...params })
}
