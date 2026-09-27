import { useEffect, useRef, useState } from 'react'
import { MoveUpRight, Play, Square } from 'lucide-react'
import { exampleEditorUrl } from './example-links'
import { t } from './i18n/site-strings'
import { asset } from './site-preferences'

export function InsidePreview() {
  const figure = useRef<HTMLElement>(null)
  const [active, setActive] = useState(false)
  const [motionAllowed, setMotionAllowed] = useState(false)
  const [stopped, setStopped] = useState(false)

  useEffect(() => {
    const element = figure.current
    if (!element) {
      return
    }
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    let inView = false
    const update = () => {
      setMotionAllowed(!motion.matches)
      setActive(inView && !motion.matches && !document.hidden)
    }
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry?.isIntersecting ?? false
      update()
    })
    observer.observe(element)
    update()
    motion.addEventListener('change', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      observer.disconnect()
      motion.removeEventListener('change', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])

  const playing = active && !stopped
  return (
    <figure className="inside-preview" ref={figure}>
      <img
        src={asset(`examples/${playing ? 'inside-8-13' : 'inside-preview'}.webp`)}
        width="960"
        height="540"
        loading="lazy"
        alt={t('site.features.previewAlt', { name: 'Inside', first: 8, last: 13 })}
      />
      <figcaption>
        <span>{t('site.features.previewCaption', { name: 'Inside', first: 8, last: 13 })}</span>
        <div className="inside-preview-actions">
          {motionAllowed && (
            <button type="button" onClick={() => setStopped(!stopped)}>
              {stopped ? <Play size={13} /> : <Square size={13} />}
              {t(stopped ? 'site.features.previewPlay' : 'site.features.previewStop')}
            </button>
          )}
          <a href={exampleEditorUrl('inside')} target="_blank" rel="noreferrer">
            {t('site.features.previewOpen')}
            <MoveUpRight size={13} />
          </a>
        </div>
      </figcaption>
    </figure>
  )
}
