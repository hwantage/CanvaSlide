import { create } from 'zustand'
import type { Locale } from '@app/i18n/translator'

type Theme = 'light' | 'dark'
type Preferences = {
  locale: Locale
  theme: Theme
  changeLocale: (locale: Locale) => void
  changeTheme: () => void
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(`canvaslide-site-${key}`, value)
  } catch {
    // Device preferences should not block the website in restricted browsers.
  }
}

const locale: Locale = document.documentElement.lang === 'ko' ? 'ko' : 'en'
const theme: Theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'

export const useSitePreferences = create<Preferences>((set, get) => ({
  locale,
  theme,
  changeLocale: (next) => {
    document.documentElement.lang = next
    remember('language', next)
    const url = new URL(location.href)
    url.searchParams.set('lang', next)
    history.replaceState(null, '', url)
    set({ locale: next })
  },
  changeTheme: () => {
    const next = get().theme === 'light' ? 'dark' : 'light'
    document.documentElement.dataset.theme = next
    document.documentElement.style.colorScheme = next
    remember('theme', next)
    set({ theme: next })
  }
}))

export const repositoryUrl = 'https://github.com/hwantage/CanvaSlide'
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`

export function siteHref(path = '', guide?: string) {
  const params = new URLSearchParams({ lang: useSitePreferences.getState().locale })
  if (guide) {
    params.set('guide', guide)
  }
  return `${asset(path)}?${params}`
}
