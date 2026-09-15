import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Code2,
  Download,
  FileCode2,
  FileJson2,
  HardDrive,
  MoveUpRight,
  Scan,
  SlidersHorizontal
} from 'lucide-react'
import { t } from '@app/i18n/ui-strings'
import { shortcutLabel } from '@app/lib/platform-keys'
import { asset, repositoryUrl, siteHref, useSitePreferences } from './site-preferences'

export function ProductFeatures() {
  return (
    <section className="features-section container">
      <div className="section-heading">
        <h2>{t('site.features.title')}</h2>
        <p>{t('site.features.description')}</p>
      </div>
      <div className="features-layout">
        <div className="feature-primary">
          <div className="feature-description">
            <Scan size={24} />
            <h3>{t('site.features.canvasTitle')}</h3>
            <p>{t('site.features.canvasBody')}</p>
          </div>
          <figure className="editor-preview">
            <img
              src={asset('images/editor.png')}
              width="1440"
              height="900"
              loading="lazy"
              alt={t('site.screenshot.editor')}
            />
            <figcaption>
              <span>CanvaSlide</span>
              <a href={siteHref('docs/', 'editing')}>
                {t('site.docs.editing.title')}
                <MoveUpRight size={13} />
              </a>
            </figcaption>
          </figure>
        </div>
        <div className="feature-secondary">
          <article>
            <SlidersHorizontal size={24} />
            <h3>{t('site.features.controlTitle')}</h3>
            <p>{t('site.features.controlBody')}</p>
            <div className="shortcut-motif" aria-hidden="true">
              <kbd>{shortcutLabel('Z')}</kbd>
              <span>↶</span>
            </div>
          </article>
          <article>
            <HardDrive size={24} />
            <h3>{t('site.features.offlineTitle')}</h3>
            <p>{t('site.features.offlineBody')}</p>
            <span className="offline-note">
              <span />
              {t('site.hero.note')}
            </span>
          </article>
        </div>
      </div>
    </section>
  )
}

export function SharingSection() {
  return (
    <section className="sharing-section container" id="sharing" data-reveal>
      <div className="sharing-copy">
        <h2>{t('site.share.title', { format: 'HTML' })}</h2>
        <p>{t('site.share.body', { format: 'HTML' })}</p>
        <ul className="sharing-benefits">
          {(['site.share.browser', 'site.share.offline', 'site.share.motion'] as const).map(
            (key) => (
              <li key={key}>
                <Check size={14} />
                {t(key)}
              </li>
            )
          )}
        </ul>
        <a
          className="button button-small sharing-download"
          href={asset('examples/slides.html')}
          download="canvaslide-presentation.html"
        >
          <Download size={15} />
          {t('site.share.download', { format: 'HTML' })}
        </a>
        <a className="text-button" href={siteHref('docs/', 'sharing')}>
          {t('site.share.link')}
          <ArrowUpRight size={16} />
        </a>
      </div>
      <div className="sharing-files">
        <div className="document-file source-file">
          <FileJson2 size={34} strokeWidth={1.3} />
          <span>{t('site.share.source')}</span>
          <strong>.canvaslide</strong>
          <div className="file-preview">
            <i />
            <i />
            <i />
          </div>
        </div>
        <ArrowRight className="file-arrow" size={24} strokeWidth={1.5} />
        <div className="document-file export-file">
          <FileCode2 size={34} strokeWidth={1.3} />
          <span>{t('site.share.export')}</span>
          <strong>.html</strong>
          <p>
            <Check size={14} />
            {t('site.share.note')}
          </p>
        </div>
      </div>
    </section>
  )
}

export function DownloadSection() {
  const theme = useSitePreferences((s) => s.theme)
  return (
    <section className="download-section container" id="download">
      <img
        className="download-mascot"
        src={asset(`brand/wing-smile-${theme}-256.png`)}
        width="150"
        height="150"
        alt="Wing Smile"
        loading="lazy"
      />
      <h2>{t('site.download.title')}</h2>
      <p className="download-intro">{t('site.download.body')}</p>
      <div className="download-options">
        <a
          href={`${repositoryUrl}/releases`}
          target="_blank"
          rel="noreferrer"
          className="download-option"
        >
          <span className="platform-symbol" aria-hidden="true">
            ⌘
          </span>
          <span>
            <strong>macOS</strong>
            <small>{t('site.download.macDetail', { version: 'macOS 12' })}</small>
          </span>
          <span className="download-link-label">
            {t('site.download.releases')}
            <ArrowUpRight size={17} />
          </span>
        </a>
        <a
          href={`${repositoryUrl}/releases`}
          target="_blank"
          rel="noreferrer"
          className="download-option"
        >
          <span className="windows-symbol" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            <strong>Windows</strong>
            <small>{t('site.download.windowsDetail')}</small>
          </span>
          <span className="download-link-label">
            {t('site.download.releases')}
            <ArrowUpRight size={17} />
          </span>
        </a>
      </div>
      <p className="release-notice">{t('site.download.pending')}</p>
      <div className="download-guide-links">
        <a href={siteHref('docs/', 'installation')}>
          <BookOpen size={15} />
          {t('site.download.guide')}
        </a>
        <a href={`${siteHref('docs/', 'installation')}#build-from-source`}>
          <Code2 size={15} />
          {t('site.download.source')}
        </a>
      </div>
    </section>
  )
}
