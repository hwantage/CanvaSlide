import { renderToString } from 'react-dom/server'
import { Website } from './website'
import { initializeSite } from './site-preferences'
import { metadataHtml } from './site-metadata'
import { routePath, siteOrigin, siteRoutes } from './site-routes'

export function renderPages() {
  return siteRoutes.map((route) => {
    initializeSite(route)
    return {
      path: routePath(route),
      locale: route.locale,
      head: metadataHtml(route),
      body: renderToString(<Website />)
    }
  })
}

export function renderSitemap() {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${siteRoutes.map((route) => `<url><loc>${new URL(routePath(route), siteOrigin).href}</loc>${(['en', 'ko', 'x-default'] as const).map((locale) => `<xhtml:link rel="alternate" hreflang="${locale}" href="${new URL(routePath({ ...route, locale: locale === 'ko' ? 'ko' : 'en' }), siteOrigin).href}"/>`).join('')}</url>`).join('\n')}</urlset>\n`
}
