import { useEffect, useRef, type RefObject } from 'react'
import { asset } from './site-preferences'
import {
  followRayPose,
  measureRayPath,
  rayPoseAt,
  type FlightPath,
  type RayPose
} from './ray-flight-path'
import { createRaySurface, type RaySurface } from './ray-surface'

export function useRayFlight(
  flightRef: RefObject<HTMLDivElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  enabled: boolean,
  paused: boolean
) {
  const pause = useRef(paused)
  const wake = useRef(() => {})
  useEffect(() => {
    pause.current = paused
    wake.current()
  }, [paused])
  useEffect(() => {
    const flight = flightRef.current
    const canvas = canvasRef.current
    const home = document.querySelector<HTMLElement>('.home-page')
    const origin = document.querySelector<HTMLElement>('.hero-ray')
    const dock = document.querySelector<HTMLElement>('.ray-dock img')
    if (!enabled || !flight || !canvas || !home || !origin || !dock) {
      return
    }
    flight.dataset.renderer = 'image'
    let path: FlightPath = []
    let dirty = true
    let animation = 0
    let disposed = false
    let surface: RaySurface | null = null
    let revision = 0
    let phase = 0
    let pose: RayPose | null = null
    let previous = performance.now()
    let lastDraw = 0
    const tick = (now: number) => {
      animation = 0
      if (disposed || document.hidden) {
        return
      }
      if (dirty) {
        path = measureRayPath(origin, dock)
        const width = window.innerWidth < 801 ? 768 : 1200
        if (canvas.width !== width) {
          canvas.width = width
          canvas.height = (width * 2) / 3
        }
        dirty = false
        lastDraw = 0
      }
      const elapsed = Math.min(64, now - previous)
      if (!pause.current) {
        phase += elapsed / 1000
      }
      previous = now
      const target = rayPoseAt(window.scrollY, path)
      const motion = pose ? followRayPose(pose, target, elapsed) : { pose: target, moving: false }
      pose = motion.pose
      const lift = Math.sin(phase * 1.05) * (pose.stage === 'swimming' ? 5 : 2)
      flight.style.width = `${pose.width}px`
      flight.style.transform = `translate3d(${pose.x - pose.width / 2}px, ${pose.y - pose.width / 3 + lift}px, 0) rotate(${pose.bank + Math.sin(phase * 0.8) * 0.8}deg)`
      flight.style.opacity = String(pose.opacity)
      flight.dataset.stage = pose.stage
      if (surface && (now - lastDraw >= 32 || pause.current)) {
        surface.draw(phase)
        lastDraw = now
      }
      home.dataset.rayReady = 'true'
      const running = !pause.current || motion.moving
      // Why: pausing draws one last frame on the next tick; tests wait for 'still' to compare it.
      flight.dataset.motion = running ? 'running' : 'still'
      if (running) {
        animation = requestAnimationFrame(tick)
      }
    }
    const schedule = () => {
      if (!animation && !disposed && !document.hidden) {
        previous = performance.now()
        animation = requestAnimationFrame(tick)
      }
    }
    const measure = () => {
      dirty = true
      schedule()
    }
    const visibility = () => {
      cancelAnimationFrame(animation)
      animation = 0
      previous = performance.now()
      if (document.hidden) {
        delete flight.dataset.motion
      }
      schedule()
    }
    const loadSurface = async () => {
      const current = ++revision
      const next = await createRaySurface(canvas, asset('brand/ray-master.png'))
      if (disposed || current !== revision) {
        next?.dispose()
        return
      }
      surface?.dispose()
      surface = next
      surface?.draw(phase)
      flight.dataset.renderer = next ? 'webgl' : 'image'
      schedule()
    }
    const lost = (event: Event) => {
      event.preventDefault()
      revision++
      surface?.dispose()
      surface = null
      flight.dataset.renderer = 'image'
    }
    const restored = () => {
      void loadSurface()
    }
    const observer = new ResizeObserver(measure)
    observer.observe(home)
    observer.observe(origin)
    observer.observe(dock)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', measure)
    document.addEventListener('visibilitychange', visibility)
    canvas.addEventListener('webglcontextlost', lost)
    canvas.addEventListener('webglcontextrestored', restored)
    void document.fonts.ready.then(() => {
      if (!disposed) {
        measure()
      }
    })
    void loadSurface()
    schedule()
    wake.current = schedule
    return () => {
      disposed = true
      cancelAnimationFrame(animation)
      observer.disconnect()
      surface?.dispose()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', measure)
      document.removeEventListener('visibilitychange', visibility)
      canvas.removeEventListener('webglcontextlost', lost)
      canvas.removeEventListener('webglcontextrestored', restored)
      delete home.dataset.rayReady
      delete flight.dataset.motion
      wake.current = () => {}
    }
  }, [enabled, flightRef, canvasRef])
}
