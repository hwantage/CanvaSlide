const siteOrigin = 'https://hwantage.github.io/CanvaSlide/'

export function updateMetadata(title: string, description: string, path: string, image?: string) {
  document.querySelector('title')?.replaceChildren(title)
  document.querySelector('meta[name="description"]')?.setAttribute('content', description)
  document
    .querySelector('link[rel="canonical"]')
    ?.setAttribute('href', new URL(path, siteOrigin).href)
  document
    .querySelector('meta[property="og:url"]')
    ?.setAttribute('content', new URL(path, siteOrigin).href)
  for (const attribute of ['property', 'name']) {
    const prefix = attribute === 'property' ? 'og' : 'twitter'
    document.querySelector(`meta[${attribute}="${prefix}:title"]`)?.setAttribute('content', title)
    document
      .querySelector(`meta[${attribute}="${prefix}:description"]`)
      ?.setAttribute('content', description)
    const preview = document.querySelector(`meta[${attribute}="${prefix}:image"]`)
    if (image) {
      preview?.setAttribute('content', new URL(image, siteOrigin).href)
    } else {
      preview?.remove()
    }
  }
  document
    .querySelector('meta[name="twitter:card"]')
    ?.setAttribute('content', image ? 'summary_large_image' : 'summary')
}
