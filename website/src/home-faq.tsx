import { t, type SiteStringKey } from './i18n/site-strings'
import { siteHref } from './site-preferences'
import { topicTitle, type TopicId } from './docs-topics'

const questions: {
  question: SiteStringKey
  answer: SiteStringKey
  guide: TopicId
  anchor?: string
}[] = [
  { question: 'site.faq.productQ', answer: 'site.faq.productA', guide: 'overview' },
  { question: 'site.faq.nestedQ', answer: 'site.faq.nestedA', guide: 'frames' },
  {
    question: 'site.faq.framesQ',
    answer: 'site.faq.framesA',
    guide: 'frames',
    anchor: 'detail-frames'
  },
  { question: 'site.faq.figmaQ', answer: 'site.faq.figmaA', guide: 'media', anchor: 'figma' },
  { question: 'site.faq.aiQ', answer: 'site.faq.aiA', guide: 'ai' },
  { question: 'site.faq.platformQ', answer: 'site.faq.platformA', guide: 'installation' },
  {
    question: 'site.docs.faq.offlineQ',
    answer: 'site.docs.faq.offlineA',
    guide: 'sharing',
    anchor: 'play-anywhere'
  },
  { question: 'site.faq.viewersQ', answer: 'site.faq.viewersA', guide: 'sharing' },
  {
    question: 'site.faq.cloudQ',
    answer: 'site.faq.cloudA',
    guide: 'sharing',
    anchor: 'cloud-links'
  },
  { question: 'site.faq.freeQ', answer: 'site.faq.freeA', guide: 'faq', anchor: 'license' }
]

const copyParams = {
  app: 'CanvaSlide',
  design: 'Figma',
  fig: '.fig',
  pdf: 'PDF',
  html: 'HTML',
  format: '.canvaslide',
  mac: 'macOS',
  windows: 'Windows'
}

export function HomeFaq() {
  return (
    <section className="home-faq container" id="faq" aria-labelledby="faq-title">
      <div className="section-heading">
        <h2 id="faq-title">{t('site.faq.title')}</h2>
        <p>{t('site.faq.description')}</p>
      </div>
      <div className="faq-questions">
        {questions.map(({ question, answer, guide, anchor }, index) => (
          <details key={question} open={index === 0}>
            <summary>{t(question, copyParams)}</summary>
            <p>{t(answer, copyParams)}</p>
            <a href={`${siteHref('docs/', guide)}${anchor ? `#${anchor}` : ''}`}>
              {t(topicTitle(guide))}
            </a>
          </details>
        ))}
      </div>
    </section>
  )
}
