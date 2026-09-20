import { ArrowDown, ArrowUpRight, FileCode2 } from 'lucide-react'
import { t } from '@app/i18n/ui-strings'
import { ScrollStory } from './scroll-story'
import { DownloadSection, ProductFeatures, SharingSection } from './product-sections'
import { useSectionReveal } from './use-section-reveal'
import { asset, siteHref } from './site-preferences'
import { webAppUrl } from './example-links'
import { ShowcasePreview } from './showcase'
import { Workflows } from './workflows'
import { Possibilities } from './possibilities'
import { DetailZoom } from './detail-zoom'
import { PresentationOverview } from './presentation-overview'

export function Landing() {
  useSectionReveal()
  return (
    <main id="main">
      <section className="hero container" id="product">
        <div className="hero-copy">
          <p className="hero-eyebrow">{t('site.hero.eyebrow')}</p>
          <h1>{t('site.hero.title')}</h1>
          <p className="hero-description">{t('site.hero.description')}</p>
          <div className="hero-actions">
            <a className="button" href={siteHref('showcase/')}>
              {t('site.hero.try')}
              <ArrowUpRight size={17} />
            </a>
            <a className="text-button" href={webAppUrl} target="_blank" rel="noreferrer">
              {t('site.hero.editor')}
              <ArrowUpRight size={16} />
            </a>
          </div>
          <p className="hero-note">{t('site.hero.note')}</p>
        </div>
        <figure className="hero-illustration">
          <div className="hero-frame" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          <img
            className="hero-ray"
            src={asset('brand/ray-master.png')}
            width="1536"
            height="1024"
            fetchPriority="high"
            alt={t('site.hero.ray', { product: 'CanvaSlide' })}
          />
          <figcaption className="hero-file">
            <FileCode2 size={28} strokeWidth={1.4} />
            <span>
              <strong>.html</strong>
              <span>{t('site.hero.file')}</span>
            </span>
            <ArrowUpRight size={18} />
          </figcaption>
        </figure>
        <a className="scroll-cue" href="#possibilities">
          <span className="scroll-track">
            <ArrowDown size={14} />
          </span>
          {t('site.hero.scroll')}
        </a>
      </section>
      <ShowcasePreview />
      <Workflows />
      <Possibilities />
      <SharingSection />
      <DetailZoom />
      <PresentationOverview />
      <div id="experience">
        <ScrollStory />
      </div>
      <ProductFeatures />
      <DownloadSection />
    </main>
  )
}
