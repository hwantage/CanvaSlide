import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { t } from '@app/i18n/ui-strings'
import { asset } from './site-preferences'
import { useRayFlight } from './use-ray-flight'

export function RayJourney() {
  const flight = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [reduced, setReduced] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  const [paused, setPaused] = useState(() => {
    try {
      return localStorage.getItem('canvaslide-site-ray-paused') === 'true'
    } catch {
      return false
    }
  })
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)')
    const changed = () => setReduced(preference.matches)
    preference.addEventListener('change', changed)
    return () => preference.removeEventListener('change', changed)
  }, [])
  useRayFlight(flight, canvas, !reduced, paused)
  return (
    <>
      <div className="ray-layer" aria-hidden="true" hidden={reduced}>
        <div className="ray-flight" ref={flight} data-renderer="image">
          <img src={asset('brand/ray-master.png')} width="1536" height="1024" alt="" />
          <canvas ref={canvas} width="1200" height="800" />
        </div>
      </div>
      {!reduced && (
        <button
          className="ray-motion-toggle icon-button"
          type="button"
          aria-label={t(paused ? 'site.ray.play' : 'site.ray.pause')}
          title={t(paused ? 'site.ray.play' : 'site.ray.pause')}
          aria-pressed={paused}
          onClick={() => {
            const next = !paused
            setPaused(next)
            try {
              localStorage.setItem('canvaslide-site-ray-paused', String(next))
            } catch {
              /* Motion remains optional when storage is unavailable. */
            }
          }}
        >
          {paused ? <Play size={14} /> : <Pause size={14} />}
        </button>
      )}
    </>
  )
}
