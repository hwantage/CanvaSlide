import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Maximize2, Pause, Play } from 'lucide-react'
import { t } from './i18n/site-strings'
import { asset } from './site-preferences'
import { useDemoCamera } from './use-demo-camera'
import storyFrames from './slide-story-frames.json'

const labels = ['site.demo.all', 'site.demo.idea', 'site.demo.frame', 'site.demo.story'] as const
const [results, detail] = storyFrames
const overview = { cx: 700, cy: 500, w: 1400, height: 630 }
const views = [
  overview,
  overview,
  ...storyFrames.map((frame) => ({
    cx: frame.x + frame.width / 2,
    cy: frame.y + frame.height / 2,
    w: frame.width * 1.12,
    height: frame.height * 1.12
  }))
]

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
  const { viewport, world } = useDemoCamera(scene, views)
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
        <span>{t('site.demo.document', { name: 'Northwind Launch Deck' })}</span>
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
          <img
            className="demo-canvas-image"
            src={asset('examples/slides.png')}
            width="1400"
            height="1000"
            alt={t('site.possibilities.slidesAlt')}
            loading="lazy"
          />
          <img
            className="demo-results-image"
            src={asset('examples/slide-detail.png')}
            style={{
              left: results!.x,
              top: results!.y,
              width: results!.width,
              height: results!.height
            }}
            alt=""
            loading="lazy"
          />
          <div
            className="demo-nested-frame"
            aria-hidden="true"
            style={{
              left: detail!.x,
              top: detail!.y,
              width: detail!.width,
              height: detail!.height
            }}
          />
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
