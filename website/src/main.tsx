import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { t } from '@app/i18n/ui-strings'
import { SiteShell } from './site-shell'
import { Landing } from './landing'
import { Documentation } from './docs'
import { useSitePreferences } from './site-preferences'
import { updateMetadata } from './site-metadata'
import './site.css'
import './docs.css'
import { RayJourney } from './ray-journey'

function Website() {
  const locale = useSitePreferences((s) => s.locale)
  const theme = useSitePreferences((s) => s.theme)
  const isDocs = location.pathname.replace(/index\.html$/, '').endsWith('/docs/')
  useEffect(() => {
    if (isDocs) {
      return
    }
    updateMetadata(
      t('site.meta.home', { product: 'CanvaSlide' }),
      t('site.meta.description'),
      `?lang=${locale}`,
      'og.png'
    )
  }, [locale, isDocs])
  useEffect(() => {
    const color = getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color)
  }, [theme])
  return (
    <div id="top" lang={locale} className={isDocs ? 'docs-page' : 'home-page'}>
      <SiteShell showRay={!isDocs}>{isDocs ? <Documentation /> : <Landing />}</SiteShell>
      {!isDocs && <RayJourney />}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Website />
  </StrictMode>
)
