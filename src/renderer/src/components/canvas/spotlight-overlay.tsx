import { useLayoutEffect, useRef } from 'react'
import { spotlightMaskPath } from '@shared/canvas/presentation-shot'
import { useCameraStore } from '@/store/camera-store'
import {
  selectPresentationActive,
  selectPresentationShot,
  usePresentationStore
} from '@/store/presentation-store'

/**
 * Dims everything outside the shot's cut-out. It lives inside `PresentationStage`, so the hole rolls
 * with the world, and the rect it is given already travels between frames during a flight.
 */
export function SpotlightOverlay() {
  const active = usePresentationStore(selectPresentationActive)
  const pathRef = useRef<SVGPathElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // Why: the camera and the dim strength both change every frame during a flight.
  useLayoutEffect(() => {
    if (!active) {
      return
    }
    const apply = () => {
      const path = pathRef.current
      const svg = svgRef.current
      if (!path || !svg) {
        return
      }
      const shot = selectPresentationShot(usePresentationStore.getState())
      const { camera, viewport } = useCameraStore.getState()
      const mask = spotlightMaskPath(shot, camera, viewport)
      if (!mask) {
        svg.style.display = 'none'
        return
      }
      svg.style.display = ''
      path.setAttribute('d', mask)
      path.setAttribute('fill-opacity', String(shot.spotlight))
    }
    apply()
    const unsubscribeCamera = useCameraStore.subscribe(apply)
    const unsubscribePresentation = usePresentationStore.subscribe(apply)
    return () => {
      unsubscribeCamera()
      unsubscribePresentation()
    }
  }, [active])

  if (!active) {
    return null
  }
  return (
    <svg
      ref={svgRef}
      aria-hidden
      data-testid="spotlight-overlay"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
    >
      {/* Even-odd punches the frame out of one big dim rect, so there is a single painted shape. */}
      <path ref={pathRef} fillRule="evenodd" className="fill-black" fillOpacity={0} />
    </svg>
  )
}
