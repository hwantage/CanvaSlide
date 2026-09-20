import type { ExampleId } from '@shared/example-catalog'

export const webAppUrl = import.meta.env.VITE_WEB_APP_URL || 'https://canvaslide.pages.dev/'

export function exampleEditorUrl(id: ExampleId): string {
  const url = new URL(webAppUrl)
  url.search = ''
  url.hash = ''
  url.searchParams.set('example', id)
  return url.href
}
