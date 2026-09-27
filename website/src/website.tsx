import { useEffect } from 'react'
import { SiteShell } from './site-shell'
import { Landing } from './landing'
import { Documentation } from './docs'
import { useSitePreferences } from './site-preferences'
import { RayJourney } from './ray-journey'
import { Showcase } from './showcase'

export function Website() {
  const locale = useSitePreferences((s) => s.locale)
  const page = useSitePreferences((s) => s.route.page)
  const theme = useSitePreferences((s) => s.theme)
  const enhanced = useSitePreferences((s) => s.enhanced)
  useEffect(() => {
    useSitePreferences.setState({
      enhanced: true,
      theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
    })
  }, [])
  useEffect(() => {
    const color = getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color)
  }, [theme])
  return (
    <div id="top" lang={locale} className={page === 'docs' ? 'docs-page' : 'home-page'}>
      <SiteShell currentPage={page} showRay={page === 'product'}>
        {page === 'docs' ? <Documentation /> : page === 'showcase' ? <Showcase /> : <Landing />}
      </SiteShell>
      {page === 'product' && enhanced && <RayJourney />}
    </div>
  )
}
