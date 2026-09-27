import { t } from './i18n/site-strings'
import { topicTitle, topicSummary, topicHeading, topicCopyParams } from './docs-topics'
import { routePath, siteOrigin, type SiteRoute } from './site-routes'

export function pageMetadata(route: SiteRoute) {
  const topic = route.topic ?? 'overview'
  return {
    title:
      route.page === 'product'
        ? t('site.meta.home', { product: 'CanvaSlide' })
        : route.page === 'showcase'
          ? t('site.showcase.meta', { product: 'CanvaSlide' })
          : `${t(topicHeading(topic), topicCopyParams)} — CanvaSlide ${t('site.docs.title')}`,
    description:
      route.page === 'product'
        ? t('site.meta.description', {
            design: 'Figma',
            pdf: 'PDF',
            mac: 'macOS',
            windows: 'Windows',
            html: 'HTML'
          })
        : route.page === 'showcase'
          ? t('site.showcase.description')
          : t(topicSummary(topic), topicCopyParams),
    url: new URL(routePath(route), siteOrigin).href,
    image: new URL(
      route.page === 'docs' && topic === 'frames' ? 'images/present.png' : 'og.png',
      siteOrigin
    ).href
  }
}

function structuredData(route: SiteRoute) {
  const meta = pageMetadata(route)
  const home = new URL(routePath({ locale: route.locale, page: 'product' }), siteOrigin).href
  const crumbs = [{ '@type': 'ListItem', position: 1, name: 'CanvaSlide', item: home }]
  if (route.page === 'docs') {
    crumbs.push({
      '@type': 'ListItem',
      position: 2,
      name: t('site.docs.title'),
      item: new URL(routePath({ ...route, topic: 'overview' }), siteOrigin).href
    })
    if (route.topic !== 'overview') {
      crumbs.push({
        '@type': 'ListItem',
        position: 3,
        name: t(topicTitle(route.topic!)),
        item: meta.url
      })
    }
  } else if (route.page === 'showcase') {
    crumbs.push({ '@type': 'ListItem', position: 2, name: t('site.nav.showcase'), item: meta.url })
  }
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${siteOrigin}#website`,
        url: siteOrigin,
        name: 'CanvaSlide',
        inLanguage: ['en', 'ko']
      },
      {
        '@type': 'WebPage',
        '@id': meta.url,
        url: meta.url,
        name: meta.title,
        description: meta.description,
        inLanguage: route.locale,
        isPartOf: { '@id': `${siteOrigin}#website` },
        ...(crumbs.length > 1 ? { breadcrumb: { '@id': `${meta.url}#breadcrumb` } } : {})
      },
      ...(crumbs.length > 1
        ? [{ '@type': 'BreadcrumbList', '@id': `${meta.url}#breadcrumb`, itemListElement: crumbs }]
        : []),
      ...(route.page === 'product'
        ? [
            {
              '@type': 'SoftwareApplication',
              '@id': `${siteOrigin}#app`,
              name: 'CanvaSlide',
              url: home,
              description: meta.description,
              applicationCategory: 'MultimediaApplication',
              operatingSystem: 'macOS, Windows, Web',
              isAccessibleForFree: true,
              license: 'https://github.com/hwantage/CanvaSlide/blob/main/LICENSE',
              downloadUrl: 'https://github.com/hwantage/CanvaSlide/releases'
            }
          ]
        : [])
    ]
  }
}

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!
  )
}

export function metadataHtml(route: SiteRoute): string {
  const { title, description, url, image } = pageMetadata(route)
  const meta = (attribute: string, key: string, value: string) =>
    `<meta ${attribute}="${key}" content="${escapeHtml(value)}">`
  return [
    `<title>${escapeHtml(title)}</title>`,
    meta('name', 'description', description),
    `<link rel="canonical" href="${url}">`,
    ...(['en', 'ko', 'x-default'] as const).map(
      (locale) =>
        `<link rel="alternate" hreflang="${locale}" href="${new URL(routePath({ ...route, locale: locale === 'ko' ? 'ko' : 'en' }), siteOrigin).href}">`
    ),
    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', 'CanvaSlide'),
    meta('property', 'og:locale', route.locale === 'ko' ? 'ko_KR' : 'en_US'),
    meta('property', 'og:locale:alternate', route.locale === 'ko' ? 'en_US' : 'ko_KR'),
    meta('property', 'og:url', url),
    meta('name', 'twitter:card', 'summary_large_image'),
    ...(['og', 'twitter'] as const).flatMap((prefix) => [
      meta(prefix === 'og' ? 'property' : 'name', `${prefix}:title`, title),
      meta(prefix === 'og' ? 'property' : 'name', `${prefix}:description`, description),
      meta(prefix === 'og' ? 'property' : 'name', `${prefix}:image`, image)
    ]),
    `<script type="application/ld+json">${JSON.stringify(structuredData(route)).replace(/</g, '\\u003c')}</script>`
  ].join('\n')
}
