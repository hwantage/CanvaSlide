import { useState } from 'react'
import { ArrowUpRight, ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react'
import { t } from './i18n/site-strings'
import { asset, siteHref } from './site-preferences'
import { useDemoCamera } from './use-demo-camera'
import frames from './architecture-preview-frames.json'

const names = [
  'site.overview.edgeFrame',
  'site.overview.servicesFrame',
  'site.overview.dataFrame'
] as const
const views = [
  { cx: 700, cy: 450, w: 1400, height: 820 },
  ...frames.map((frame) => ({
    cx: frame.x + frame.width / 2,
    cy: frame.y + frame.height / 2,
    w: frame.width * 1.09,
    height: frame.height * 1.09
  }))
]

export function PresentationOverview() {
  const [scene, setScene] = useState(0)
  const { viewport, world } = useDemoCamera(scene, views)
  return (
    <section className="overview-section container" id="overview">
      <div className="overview-copy">
        <h2>{t('site.overview.title')}</h2>
        <p>{t('site.overview.description')}</p>
        <a className="text-button" href={`${siteHref('docs/', 'frames')}#whole-story`}>
          {t('site.overview.link')}
          <ArrowUpRight size={15} />
        </a>
      </div>
      <div className="overview-demo" data-scene={scene}>
        <div
          className="overview-viewport"
          ref={viewport}
          role="region"
          aria-label={t('site.overview.region')}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') {
              setScene(Math.min(frames.length, scene + 1))
            } else if (event.key === 'ArrowLeft') {
              setScene(Math.max(0, scene - 1))
            } else if (event.key === 'Escape' || event.key === 'Home') {
              setScene(0)
            } else {
              return
            }
            event.preventDefault()
          }}
        >
          <div className="overview-world" ref={world}>
            <img
              src={asset('examples/architecture.png')}
              width="1400"
              height="1000"
              alt={t('site.showcase.architecture.alt')}
              loading="lazy"
            />
            {frames.map((frame, index) => (
              <button
                key={index}
                className="overview-slide"
                type="button"
                style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }}
                aria-label={t('site.overview.open', { n: index + 1, name: t(names[index]!) })}
                aria-hidden={scene !== 0}
                tabIndex={scene === 0 ? 0 : -1}
                onClick={() => {
                  viewport.current?.focus({ preventScroll: true })
                  setScene(index + 1)
                }}
              >
                <span>{index + 1}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="overview-controls">
          <button
            className="overview-return"
            type="button"
            aria-pressed={scene === 0}
            onClick={() => setScene(0)}
          >
            <LayoutGrid size={15} />
            {t('site.overview.all')}
          </button>
          <span className="overview-current" aria-live="polite">
            {scene > 0
              ? `${scene} / ${frames.length} · ${t(names[scene - 1]!)}`
              : `${frames.length}`}
          </span>
          <button
            className="icon-button"
            type="button"
            disabled={scene === 0}
            aria-label={t('site.overview.previous')}
            onClick={() => setScene(scene - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            className="icon-button"
            type="button"
            disabled={scene === frames.length}
            aria-label={t('site.overview.next')}
            onClick={() => setScene(scene + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <p className="overview-hint">{t('site.overview.hint')}</p>
        <p className="overview-caption">{t('site.overview.caption')}</p>
      </div>
    </section>
  )
}
