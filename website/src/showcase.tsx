import { useEffect } from 'react'
import { ArrowUpRight, Download, Play } from 'lucide-react'
import { exampleAssetPath, exampleCatalog, type ExampleId } from '@shared/example-catalog'
import { t } from './i18n/site-strings'
import { asset, siteHref, useSitePreferences } from './site-preferences'
import { exampleEditorUrl } from './example-links'
import { updateMetadata } from './site-metadata'

const closingExamples: readonly ExampleId[] = [
  'swing',
  'anatomy',
  'freefall',
  'inside',
  'canvaslide-claude',
  'canvaslide-codex'
]
const exampleCopyParams = {
  app: 'CanvaSlide',
  claude: 'Claude',
  codex: 'Codex',
  svg: 'SVG',
  size: '25 MiB'
}
const showcaseIds = [
  ...exampleCatalog
    .map(({ id }) => id)
    .filter((id) => id !== 'one-order' && !closingExamples.includes(id)),
  ...closingExamples
]

export function ExampleActions({ id }: { id: ExampleId }) {
  return (
    <div className="showcase-actions">
      <a
        className="button button-small"
        href={exampleEditorUrl(id)}
        target="_blank"
        rel="noreferrer"
      >
        <Play size={15} />
        {t('site.showcase.open')}
      </a>
      <a className="text-button" href={asset(exampleAssetPath(id))} download={`${id}.canvaslide`}>
        <Download size={15} />
        {t('site.showcase.download')}
      </a>
    </div>
  )
}

export function FeaturedExample({ heading = 'h2' }: { heading?: 'h2' | 'h3' }) {
  const Heading = heading
  return (
    <article className="featured-example" aria-labelledby="featured-example-title">
      <a
        className="featured-preview"
        href={exampleEditorUrl('one-order')}
        target="_blank"
        rel="noreferrer"
        aria-label={t('site.showcase.featuredOpen')}
      >
        <img
          src={asset('examples/one-order-showcase.png')}
          width="1400"
          height="1000"
          alt={t('site.showcase.one-order.alt')}
          loading="lazy"
        />
        <span className="preview-action">
          <Play size={18} />
          {t('site.showcase.open')}
        </span>
      </a>
      <div className="featured-copy">
        <p className="showcase-category">{t('site.showcase.featured')}</p>
        <Heading id="featured-example-title">{t('site.showcase.one-order.title')}</Heading>
        <p>{t('site.showcase.one-order.body')}</p>
        <p className="showcase-hint">{t('site.showcase.one-order.try')}</p>
        <ExampleActions id="one-order" />
      </div>
    </article>
  )
}

export function ShowcasePreview() {
  return (
    <section className="showcase-preview container" id="showcase">
      <div className="section-heading">
        <h2>{t('site.showcase.homeTitle')}</h2>
        <a className="text-button" href={siteHref('showcase/')}>
          {t('site.showcase.browse')}
          <ArrowUpRight size={17} />
        </a>
      </div>
      <FeaturedExample heading="h3" />
    </section>
  )
}

export function Showcase() {
  const locale = useSitePreferences((s) => s.locale)
  useEffect(() => {
    updateMetadata(
      t('site.showcase.meta', { product: 'CanvaSlide' }),
      t('site.showcase.description'),
      `showcase/?lang=${locale}`,
      'og.png'
    )
  }, [locale])
  return (
    <main id="main" className="showcase-page container">
      <div className="showcase-intro">
        <h1>{t('site.nav.showcase')}</h1>
        <p>{t('site.showcase.description')}</p>
        <a className="text-button" href={siteHref('docs/', 'examples')}>
          {t('site.showcase.guide')}
          <ArrowUpRight size={16} />
        </a>
      </div>
      <FeaturedExample />
      <p className="showcase-instructions">{t('site.showcase.instructions')}</p>
      <div className="showcase-grid">
        {showcaseIds.map((id) => (
          <article className="showcase-card" key={id} aria-labelledby={`example-${id}`}>
            <a
              className="showcase-image"
              href={exampleEditorUrl(id)}
              target="_blank"
              rel="noreferrer"
              aria-label={t('site.showcase.openNamed', {
                name: t(`site.showcase.${id}.title`, exampleCopyParams)
              })}
            >
              <img
                src={asset(`examples/${id}-showcase.png`)}
                width="1400"
                height="1000"
                loading="lazy"
                alt={t(`site.showcase.${id}.alt`, exampleCopyParams)}
              />
            </a>
            <div className="showcase-card-copy">
              <h2 id={`example-${id}`}>{t(`site.showcase.${id}.title`, exampleCopyParams)}</h2>
              <p>{t(`site.showcase.${id}.body`, exampleCopyParams)}</p>
              <ExampleActions id={id} />
            </div>
          </article>
        ))}
      </div>
    </main>
  )
}
