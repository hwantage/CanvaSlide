import { useEffect, useRef, useState } from 'react'
import { t } from '@app/i18n/ui-strings'
import { CanvasDemo } from './canvas-demo'

const chapters = [
  { title: 'site.story.step1Title', body: 'site.story.step1Body' },
  { title: 'site.story.step2Title', body: 'site.story.step2Body' },
  { title: 'site.story.step3Title', body: 'site.story.step3Body' }
] as const

export function ScrollStory() {
  const section = useRef<HTMLElement>(null)
  const [scene, setScene] = useState(1)

  useEffect(() => {
    const element = section.current
    if (!element) {
      return
    }
    let frame = 0
    let previousY = window.scrollY
    const update = () => {
      frame = 0
      if (window.innerWidth < 801 || window.scrollY === previousY) {
        return
      }
      previousY = window.scrollY
      // Focused controls own the camera; focus-induced scrolling must not override a choice.
      if (element.contains(document.activeElement)) {
        return
      }
      const rect = element.getBoundingClientRect()
      const distance = Math.max(1, element.offsetHeight - window.innerHeight)
      const progress = Math.max(0, Math.min(0.999, -rect.top / distance))
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        setScene(Math.floor(progress * 3) + 1)
      }
    }
    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(update)
      }
    }
    window.addEventListener('scroll', schedule, { passive: true })
    return () => {
      window.removeEventListener('scroll', schedule)
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <section className="scroll-story" id="story" ref={section}>
      <div className="story-sticky container">
        <div className="section-heading">
          <h2>{t('site.story.title')}</h2>
          <p>{t('site.story.description')}</p>
        </div>
        <div className="story-layout">
          <div className="story-chapters" role="group" aria-label={t('site.story.controls')}>
            {chapters.map((chapter, index) => (
              <button
                className={`story-step ${scene === index + 1 ? 'active' : ''}`}
                type="button"
                key={chapter.title}
                aria-pressed={scene === index + 1}
                onClick={() => setScene(index + 1)}
              >
                <span className="step-number">0{index + 1}</span>
                <span>
                  <strong>{t(chapter.title)}</strong>
                  <span className="step-description">{t(chapter.body)}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="story-stage">
            <CanvasDemo controlledScene={scene} onSceneChange={setScene} compact />
            <div className="story-progress" aria-hidden="true">
              {chapters.map((chapter, index) => (
                <span key={chapter.title} className={scene >= index + 1 ? 'passed' : ''} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
