import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Maximize2, MousePointer2, Pause, Play } from 'lucide-react'
import { t } from './i18n/site-strings'
import { asset } from './site-preferences'
import { useDemoCamera } from './use-demo-camera'

const labels = ['site.demo.all', 'site.demo.idea', 'site.demo.frame', 'site.demo.story'] as const

export function CanvasDemo({
  controlledScene,
  onSceneChange,
  compact = false
}: {
  controlledScene?: number
  onSceneChange?: (scene: number) => void
  compact?: boolean
}) {
  const [selected, setSelected] = useState(0)
  const [playing, setPlaying] = useState(false)
  const scene = controlledScene ?? selected
  const { viewport, world } = useDemoCamera(scene)
  const choose = (next: number) => {
    setPlaying(false)
    setSelected(next)
    onSceneChange?.(next)
  }

  useEffect(() => {
    if (!playing) {
      return
    }
    const timer = window.setTimeout(() => {
      if (scene >= 3) {
        setPlaying(false)
      } else {
        setSelected(scene + 1)
        onSceneChange?.(scene + 1)
      }
    }, 2400)
    return () => window.clearTimeout(timer)
  }, [playing, scene, onSceneChange])

  useEffect(() => {
    const stop = () => setPlaying(false)
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    document.addEventListener('visibilitychange', stop)
    motion.addEventListener('change', stop)
    return () => {
      document.removeEventListener('visibilitychange', stop)
      motion.removeEventListener('change', stop)
    }
  }, [])

  return (
    <div className={`canvas-demo ${compact ? 'compact-demo' : ''}`} data-scene={scene}>
      <div className="demo-titlebar">
        <span className="window-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>{t('site.demo.document')}</span>
        <Maximize2 size={14} aria-hidden="true" />
      </div>
      <div
        className="demo-viewport"
        ref={viewport}
        tabIndex={0}
        role="region"
        aria-label={t('site.demo.label')}
        onKeyDown={(event) => {
          if (['ArrowLeft', 'ArrowRight', 'Escape'].includes(event.key)) {
            event.preventDefault()
            choose(
              event.key === 'Escape'
                ? 0
                : Math.max(0, Math.min(3, scene + (event.key === 'ArrowRight' ? 1 : -1)))
            )
          }
        }}
      >
        <div className="demo-world" ref={world}>
          <svg className="demo-connections" viewBox="0 0 1080 700" aria-hidden="true">
            <path d="M390 335 C520 335 470 155 620 155 M780 255 C780 340 825 320 825 425" />
            <circle cx="390" cy="335" r="5" />
            <circle cx="620" cy="155" r="5" />
            <circle cx="780" cy="255" r="5" />
            <circle cx="825" cy="425" r="5" />
          </svg>
          <p className="canvas-thought">{t('site.demo.note')}</p>
          <article className="sample-frame frame-idea">
            <span className="frame-tab">1 / {t('site.demo.idea')}</span>
            <h3>{t('site.demo.ideaTitle')}</h3>
            <p>{t('site.demo.ideaNote')}</p>
            <span className="sample-cursor" aria-hidden="true">
              <MousePointer2 size={22} fill="currentColor" />
            </span>
          </article>
          <article className="sample-frame frame-connect">
            <span className="frame-tab">2 / {t('site.demo.frame')}</span>
            <h3>{t('site.demo.frameTitle')}</h3>
            <p>{t('site.demo.frameNote')}</p>
          </article>
          <article className="sample-frame frame-story">
            <span className="frame-tab">3 / {t('site.demo.story')}</span>
            <h3>{t('site.demo.storyTitle')}</h3>
            <img src={asset('brand/wing-smile-light-256.png')} width="108" height="108" alt="" />
            <p>{t('site.demo.storyNote')}</p>
          </article>
          <div className="empty-frame">
            <span>+</span>
            <p>{t('site.demo.noteTwo')}</p>
          </div>
        </div>
      </div>
      <div className="demo-toolbar">
        <div className="demo-frame-buttons" role="group" aria-label={t('site.story.controls')}>
          {labels.map((label, index) => (
            <button
              key={label}
              type="button"
              aria-pressed={scene === index}
              onClick={() => choose(index)}
            >
              {index === 0 ? <Maximize2 size={14} /> : <span>{index}</span>}
              <span className="frame-button-text">{t(label)}</span>
            </button>
          ))}
        </div>
        <button
          className="demo-play"
          type="button"
          aria-label={t(playing ? 'site.demo.stop' : 'site.demo.play')}
          aria-pressed={playing}
          onClick={() => {
            if (playing) {
              setPlaying(false)
            } else {
              choose(1)
              if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
                setPlaying(true)
              }
            }
          }}
        >
          {playing ? (
            <Pause size={15} fill="currentColor" />
          ) : (
            <Play size={15} fill="currentColor" />
          )}
        </button>
      </div>
      <div className="demo-caption">
        <span role="status" aria-live="polite">
          {scene === 0 ? t('site.demo.hint') : t('site.demo.scene', { n: scene, total: 3 })}
        </span>
        <div>
          <button
            type="button"
            className="icon-button"
            disabled={scene === 0}
            aria-label={t('site.demo.previous')}
            onClick={() => choose(scene - 1)}
          >
            <ChevronLeft size={15} />
          </button>
          <button
            type="button"
            className="icon-button"
            disabled={scene === 3}
            aria-label={t('site.demo.next')}
            onClick={() => choose(scene + 1)}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
