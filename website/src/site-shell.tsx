import { useEffect, useState, type ReactNode } from 'react'
import { ArrowUp, Menu, Moon, Sun, X } from 'lucide-react'
import { t } from '@app/i18n/ui-strings'
import { asset, repositoryUrl, siteHref, useSitePreferences } from './site-preferences'

export function Brand() {
  const theme = useSitePreferences((s) => s.theme)
  return (
    <a className="brand" href={siteHref()} aria-label={t('site.home', { product: 'CanvaSlide' })}>
      <img
        className="brand-full"
        src={asset(`brand/canvaslide-${theme}.png`)}
        alt="CanvaSlide"
        width="202"
        height="60"
      />
      <img
        className="brand-compact"
        src={asset('brand/wing-smile-light-256.png')}
        alt="CanvaSlide"
        width="44"
        height="44"
      />
    </a>
  )
}

export function SiteShell({
  children,
  showRay = false
}: {
  children: ReactNode
  showRay?: boolean
}) {
  const locale = useSitePreferences((s) => s.locale)
  const theme = useSitePreferences((s) => s.theme)
  const changeLocale = useSitePreferences((s) => s.changeLocale)
  const changeTheme = useSitePreferences((s) => s.changeTheme)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [])

  return (
    <>
      <a className="skip-link" href="#main">
        {t('site.skip')}
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Brand />
          <nav
            id="site-navigation"
            className={`header-nav ${menuOpen ? 'is-open' : ''}`}
            aria-label={t('site.nav.label')}
          >
            <a href={`${siteHref()}#product`} onClick={() => setMenuOpen(false)}>
              {t('site.nav.product')}
            </a>
            <a href={siteHref('docs/')}>{t('site.nav.docs')}</a>
            <a href={repositoryUrl} target="_blank" rel="noreferrer" className="source-link">
              <img src={asset(`brand/github-mark-${theme}.svg`)} width="20" height="20" alt="" />
              GitHub
            </a>
          </nav>
          <div className="header-actions">
            <div className="language-switch" role="group" aria-label={t('site.language')}>
              <button
                type="button"
                lang="en"
                aria-pressed={locale === 'en'}
                onClick={() => changeLocale('en')}
              >
                EN
              </button>
              <span aria-hidden="true">/</span>
              <button
                type="button"
                lang="ko"
                aria-pressed={locale === 'ko'}
                onClick={() => changeLocale('ko')}
              >
                한국어
              </button>
            </div>
            <button
              className="icon-button theme-switch"
              type="button"
              onClick={changeTheme}
              aria-label={t(theme === 'light' ? 'site.dark' : 'site.light')}
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <a className="button button-small header-download" href={`${siteHref()}#download`}>
              {t('site.nav.download')}
            </a>
            <button
              className="icon-button mobile-menu"
              type="button"
              aria-expanded={menuOpen}
              aria-controls="site-navigation"
              aria-label={t(menuOpen ? 'site.nav.close' : 'site.nav.menu')}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X size={21} /> : <Menu size={21} />}
            </button>
          </div>
        </div>
      </header>
      {children}
      <footer className="site-footer container">
        <div className="footer-brand">
          <Brand />
          <p>{t('site.footer.tagline')}</p>
        </div>
        <nav aria-label={t('site.nav.label')}>
          <a href={siteHref('docs/')}>{t('site.nav.docs')}</a>
          <a href={`${repositoryUrl}/issues`} target="_blank" rel="noreferrer">
            {t('site.footer.issues')}
          </a>
          <a href={`${repositoryUrl}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
            {t('site.footer.licenseLink')}
          </a>
        </nav>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} CanvaSlide</span>
          <span>{t('site.footer.license')}</span>
          <a href="#top" aria-label={t('site.footer.top')}>
            <ArrowUp size={18} />
          </a>
        </div>
        {showRay && (
          <figure className="ray-dock" aria-hidden="true">
            <img src={asset('brand/ray-master.png')} width="1536" height="1024" alt="" />
          </figure>
        )}
      </footer>
    </>
  )
}
