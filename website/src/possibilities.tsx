import { useRef, useState } from 'react'
import { ArrowUpRight, Database, Download, GitBranch, Presentation } from 'lucide-react'
import { t } from '@app/i18n/ui-strings'
import { exportedExampleIds, type ExportedExampleId } from './exported-examples'
import { asset } from './site-preferences'

const copy = {
  flowchart: {
    icon: GitBranch,
    label: 'site.possibilities.flowchart',
    title: 'site.possibilities.flowchartTitle',
    body: 'site.possibilities.flowchartBody',
    alt: 'site.possibilities.flowchartAlt'
  },
  erd: {
    icon: Database,
    label: 'site.possibilities.erd',
    title: 'site.possibilities.erdTitle',
    body: 'site.possibilities.erdBody',
    alt: 'site.possibilities.erdAlt'
  },
  slides: {
    icon: Presentation,
    label: 'site.possibilities.slides',
    title: 'site.possibilities.slidesTitle',
    body: 'site.possibilities.slidesBody',
    alt: 'site.possibilities.slidesAlt'
  }
} as const satisfies Record<ExportedExampleId, unknown>

const examples = exportedExampleIds.map((id) => ({ id, ...copy[id] }))

export function Possibilities() {
  const [active, setActive] = useState(0)
  const tabs = useRef<HTMLDivElement>(null)
  const example = examples[active]!
  return (
    <section className="possibilities container" id="possibilities">
      <p className="section-eyebrow">{t('site.possibilities.eyebrow')}</p>
      <div className="section-heading">
        <h2>{t('site.possibilities.title')}</h2>
        <p>{t('site.possibilities.description')}</p>
      </div>
      <div
        className="example-tabs"
        role="tablist"
        ref={tabs}
        aria-label={t('site.possibilities.label')}
        onKeyDown={(event) => {
          let next = active
          if (event.key === 'ArrowRight') {
            next = (active + 1) % examples.length
          } else if (event.key === 'ArrowLeft') {
            next = (active + examples.length - 1) % examples.length
          } else if (event.key === 'Home') {
            next = 0
          } else if (event.key === 'End') {
            next = examples.length - 1
          } else {
            return
          }
          event.preventDefault()
          setActive(next)
          tabs.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
        }}
      >
        {examples.map((item, index) => (
          <button
            key={item.id}
            id={`tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={active === index}
            aria-controls="example-panel"
            tabIndex={active === index ? 0 : -1}
            onClick={() => setActive(index)}
          >
            <item.icon size={18} strokeWidth={1.6} />
            {t(item.label)}
          </button>
        ))}
      </div>
      <div
        className="example-panel"
        id="example-panel"
        role="tabpanel"
        aria-labelledby={`tab-${example.id}`}
        tabIndex={0}
      >
        <a
          className="example-preview"
          href={asset(`examples/${example.id}.html`)}
          target="_blank"
          rel="noreferrer"
          aria-label={t('site.possibilities.open')}
        >
          <img
            key={example.id}
            src={asset(`examples/${example.id}.png`)}
            width="1400"
            height="1000"
            loading="lazy"
            alt={t(example.alt)}
          />
          <span className="example-open">
            <ArrowUpRight size={19} />
          </span>
        </a>
        <div className="example-copy" key={example.id}>
          <span className="example-number" aria-hidden="true">
            0{active + 1} / 03
          </span>
          <h3>{t(example.title)}</h3>
          <p>{t(example.body, { style: 'PPT' })}</p>
          <a
            className="text-button"
            href={asset(`examples/${example.id}.html`)}
            target="_blank"
            rel="noreferrer"
          >
            {t('site.possibilities.open')}
            <ArrowUpRight size={16} />
          </a>
          <a
            className="example-download"
            href={asset(`examples/${example.id}.html`)}
            download={`canvaslide-${example.id}.html`}
          >
            <Download size={14} />
            {t('site.possibilities.download', { format: 'HTML' })}
          </a>
        </div>
      </div>
      <div className="example-footer">
        <p>{t('site.possibilities.more')}</p>
        <span>{t('site.possibilities.caption', { product: 'CanvaSlide' })}</span>
      </div>
    </section>
  )
}
