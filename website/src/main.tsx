import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { Website } from './website'
import { initializeSite } from './site-preferences'
import { legacyDestination, routeFromPath } from './site-routes'
import { metadataHtml } from './site-metadata'
import './site.css'
import './docs.css'
import './showcase.css'

const route = routeFromPath(location.pathname)
if (!route) {
  throw new Error('Unknown website route')
}
const destination = legacyDestination(new URL(location.href), route)
if (destination) {
  location.replace(destination)
} else {
  initializeSite(route)
  const root = document.getElementById('root')!
  const app = (
    <StrictMode>
      <Website />
    </StrictMode>
  )
  if (root.hasChildNodes()) {
    hydrateRoot(root, app)
  } else {
    document.documentElement.lang = route.locale
    document.head.insertAdjacentHTML('beforeend', metadataHtml(route))
    createRoot(root).render(app)
  }
}
