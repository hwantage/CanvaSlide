import { useLayoutEffect, useRef } from 'react'
import { createZoomPanInterpolator } from '@shared/canvas/zoom-pan-interpolation'

type CameraView = { cx: number; cy: number; w: number; height: number }

export function useDemoCamera(scene: number, views: CameraView[]) {
  const viewport = useRef<HTMLDivElement>(null)
  const world = useRef<HTMLDivElement>(null)
  const camera = useRef(views[0]!)
  const ready = useRef(false)

  useLayoutEffect(() => {
    const canvas = viewport.current
    const content = world.current
    if (!canvas || !content) {
      return
    }
    // The global reduced-motion rule must not introduce CSS transitions on this RAF-driven surface.
    content.style.transitionProperty = 'none'
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
    let animation = 0
    const paint = () => {
      const scale = canvas.clientWidth / camera.current.w
      content.style.setProperty('--camera-scale', String(scale))
      content.style.transform = `translate(${canvas.clientWidth / 2 - camera.current.cx * scale}px, ${canvas.clientHeight / 2 - camera.current.cy * scale}px) scale(${scale})`
    }
    const target = () => {
      const frame = views[scene] ?? views[0]!
      return {
        ...frame,
        w: Math.max(frame.w, (frame.height * canvas.clientWidth) / Math.max(1, canvas.clientHeight))
      }
    }
    const settle = () => {
      cancelAnimationFrame(animation)
      camera.current = target()
      paint()
    }
    const to = target()
    if (!ready.current || reducedMotion.matches) {
      settle()
      ready.current = true
    } else {
      const interpolate = createZoomPanInterpolator(camera.current, to)
      const start = performance.now()
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / 1050)
        const eased = progress * progress * (3 - 2 * progress)
        camera.current = { ...interpolate.at(eased), height: to.height }
        paint()
        if (progress < 1) {
          animation = requestAnimationFrame(tick)
        }
      }
      animation = requestAnimationFrame(tick)
    }
    // ResizeObserver also fires on attachment; preserve the initial camera transition.
    let initial = true
    const observer = new ResizeObserver(() => {
      if (initial) {
        initial = false
        return
      }
      settle()
    })
    observer.observe(canvas)
    reducedMotion.addEventListener('change', settle)
    return () => {
      cancelAnimationFrame(animation)
      observer.disconnect()
      reducedMotion.removeEventListener('change', settle)
    }
  }, [scene, views])

  return { viewport, world }
}
