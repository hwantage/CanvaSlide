import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { t } from './i18n/site-strings'
import { SiteShell } from './site-shell'
import { Landing } from './landing'
import { Documentation } from './docs'
import { useSitePreferences } from './site-preferences'
import { updateMetadata } from './site-metadata'
import './site.css'
import './docs.css'
import { RayJourney } from './ray-journey'
import { Showcase } from './showcase'
import './showcase.css'

function Website() {
  const locale = useSitePreferences((s) => s.locale)
  const theme = useSitePreferences((s) => s.theme)
  const isDocs = location.pathname.replace(/index\.html$/, '').endsWith('/docs/')
  const isShowcase = location.pathname.replace(/index\.html$/, '').endsWith('/showcase/')
  useEffect(() => {
    if (isDocs || isShowcase) {
      return
    }
    updateMetadata(
      t('site.meta.home', { product: 'CanvaSlide' }),
      t('site.meta.description', { design: 'Figma', pdf: 'PDF' }),
      `?lang=${locale}`,
      'og.png'
    )
  }, [locale, isDocs, isShowcase])
  useEffect(() => {
    const color = getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color)
  }, [theme])
  return (
    <div id="top" lang={locale} className={isDocs ? 'docs-page' : 'home-page'}>
      <SiteShell
        currentPage={isDocs ? 'docs' : isShowcase ? 'showcase' : 'product'}
        showRay={!isDocs && !isShowcase}
      >
        {isDocs ? <Documentation /> : isShowcase ? <Showcase /> : <Landing />}
      </SiteShell>
      {!isDocs && !isShowcase && <RayJourney />}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Website />
  </StrictMode>
)
