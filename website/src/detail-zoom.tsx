import { useState } from 'react'
import { ArrowUpRight, Maximize, Scan, ZoomIn } from 'lucide-react'
import { t } from '@app/i18n/ui-strings'
import { asset, siteHref } from './site-preferences'
import { useDemoCamera } from './use-demo-camera'

const views = [
  { cx: 640, cy: 360, w: 1360, height: 770 },
  { cx: 580, cy: 465, w: 1060, height: 510 },
  { cx: 945, cy: 300, w: 380, height: 280 }
]
const controls = [
  { label: 'site.zoom.whole', icon: Maximize },
  { label: 'site.zoom.chart', icon: Scan },
  { label: 'site.zoom.detail', icon: ZoomIn }
] as const

export function DetailZoom() {
  const [scene, setScene] = useState(0)
  const { viewport, world } = useDemoCamera(scene, views)
  return (
    <section className="detail-section container" id="details">
      <div className="detail-copy">
        <p className="section-eyebrow">{t('site.zoom.eyebrow')}</p>
        <h2>{t('site.zoom.title')}</h2>
        <p className="detail-description">{t('site.zoom.description')}</p>
        <a className="text-button" href={`${siteHref('docs/', 'frames')}#detail-frames`}>
          {t('site.zoom.link')}
          <ArrowUpRight size={15} />
        </a>
      </div>
      <div className="detail-demo" data-scene={scene}>
        <div
          className="detail-viewport"
          ref={viewport}
          role="region"
          tabIndex={0}
          aria-label={t('site.zoom.label')}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') {
              setScene(Math.min(2, scene + 1))
            } else if (event.key === 'ArrowLeft') {
              setScene(Math.max(0, scene - 1))
            } else if (event.key === 'Escape') {
              setScene(0)
            } else {
              return
            }
            event.preventDefault()
          }}
        >
          <div className="detail-world" ref={world}>
            <img
              src={asset('examples/slide-detail.png')}
              width="1280"
              height="720"
              loading="lazy"
              alt={t('site.zoom.image')}
            />
            <div className="detail-frame chart-frame" aria-hidden="true">
              <span>02</span>
            </div>
            <div className="detail-frame point-frame" aria-hidden="true">
              <span>03</span>
            </div>
          </div>
          <span className="detail-sample-note">{t('site.zoom.note')}</span>
        </div>
        <div className="detail-controls" role="group" aria-label={t('site.zoom.caption')}>
          {controls.map((control, index) => (
            <button
              key={control.label}
              type="button"
              aria-pressed={scene === index}
              onClick={() => setScene(index)}
            >
              <control.icon size={15} />
              {t(control.label)}
            </button>
          ))}
        </div>
        <p className="detail-caption" aria-live="polite">
          <span>0{scene + 1} / 03</span>
          {t(controls[scene]!.label)}
        </p>
      </div>
    </section>
  )
}
