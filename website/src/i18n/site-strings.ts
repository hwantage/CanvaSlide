import { createTranslator, type Locale } from '@app/i18n/translator'
import { useSitePreferences } from '../site-preferences'
import { en } from './locales/en'
import { ko } from './locales/ko'

export type SiteStringKey = keyof typeof en
export type SiteStrings = Record<SiteStringKey, string>

const siteLocales: Record<Locale, SiteStrings> = { en, ko }

// Why: the website's language is its own preference, never the app's module-level locale.
export const { t } = createTranslator(siteLocales, () => useSitePreferences.getState().locale)
