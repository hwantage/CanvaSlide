import type { Locale } from '@app/i18n/translator'
import { topics, type TopicId } from './docs-topics'

export type SiteRoute = {
  locale: Locale
  page: 'product' | 'docs' | 'showcase'
  topic?: TopicId | undefined
}
export const siteOrigin = 'https://hwantage.github.io/CanvaSlide/'
export const siteRoutes: SiteRoute[] = (['en', 'ko'] as const).flatMap((locale) => [
  { locale, page: 'product' },
  { locale, page: 'showcase' },
  ...topics.map(({ id }) => ({ locale, page: 'docs' as const, topic: id }))
])

export function routePath(route: SiteRoute): string {
  const prefix = route.locale === 'ko' ? 'ko/' : ''
  if (route.page === 'product') {
    return prefix
  }
  if (route.page === 'showcase') {
    return `${prefix}showcase/`
  }
  return `${prefix}docs/${route.topic && route.topic !== 'overview' ? `${route.topic}/` : ''}`
}

export function routeFromPath(
  pathname: string,
  base = import.meta.env.BASE_URL
): SiteRoute | undefined {
  if (!pathname.startsWith(base)) {
    return undefined
  }
  const path = pathname
    .slice(base.length)
    .replace(/index\.html$/, '')
    .replace(/\/?$/, '/')
  return siteRoutes.find((route) => (routePath(route) || '/') === path)
}

/** GitHub Pages has no project-level redirects; old query links migrate in the browser. */
export function legacyDestination(url: URL, route: SiteRoute): string | undefined {
  const locale = url.searchParams.get('lang')
  const guide = url.searchParams.get('guide')
  if (!url.searchParams.has('lang') && !url.searchParams.has('guide')) {
    return undefined
  }
  const next = { ...route }
  if (locale === 'en' || locale === 'ko') {
    next.locale = locale
  }
  if (next.page === 'docs' && topics.some(({ id }) => id === guide)) {
    next.topic = guide as TopicId
  }
  url.searchParams.delete('lang')
  url.searchParams.delete('guide')
  const query = url.searchParams.toString()
  return `${import.meta.env.BASE_URL}${routePath(next)}${query ? `?${query}` : ''}${url.hash}`
}
