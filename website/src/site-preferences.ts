import { create } from 'zustand'
import type { Locale } from '@app/i18n/translator'
import type { TopicId } from './docs-topics'
import { routePath, type SiteRoute } from './site-routes'

type Theme = 'light' | 'dark'
type Preferences = {
  route: SiteRoute
  locale: Locale
  theme: Theme
  enhanced: boolean
  changeTheme: () => void
}

function createPreferences(route: SiteRoute) {
  return create<Preferences>((set, get) => ({
    route,
    locale: route.locale,
    theme: 'light',
    enhanced: false,
    changeTheme: () => {
      const next = get().theme === 'light' ? 'dark' : 'light'
      document.documentElement.dataset.theme = next
      document.documentElement.style.colorScheme = next
      try {
        localStorage.setItem('canvaslide-site-theme', next)
      } catch {
        // Preferences are optional in restricted browsers.
      }
      set({ theme: next })
    }
  }))
}

export let useSitePreferences = createPreferences({ locale: 'en', page: 'product' })

// Each static page is rendered sequentially with its own store and matching hydration snapshot.
export function initializeSite(route: SiteRoute) {
  useSitePreferences = createPreferences(route)
}

export const repositoryUrl = 'https://github.com/hwantage/CanvaSlide'
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`

export function siteHref(path: '' | 'docs/' | 'showcase/' = '', guide?: TopicId) {
  const locale = useSitePreferences.getState().locale
  const page = path === 'docs/' ? 'docs' : path === 'showcase/' ? 'showcase' : 'product'
  return asset(routePath({ locale, page, topic: guide }))
}
