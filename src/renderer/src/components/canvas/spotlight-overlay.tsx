import { useLayoutEffect, useRef } from 'react'
import { worldRectToScreen } from '@shared/canvas/camera-transform'
import { useCameraStore } from '@/store/camera-store'
import {
  selectPresentationActive,
  selectPresentationSpotlight,
  selectSpotlightRect,
  usePresentationStore
} from '@/store/presentation-store'

/** Times the viewport so the dim still covers every corner once the stage rolls. */
const COVER = 3

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
      const presentation = usePresentationStore.getState()
      const strength = selectPresentationSpotlight(presentation)
      const rect = selectSpotlightRect(presentation)
      const { camera, viewport } = useCameraStore.getState()
      if (strength <= 0.001 || !rect) {
        svg.style.display = 'none'
        return
      }
      const hole = worldRectToScreen(camera, rect)
      const spanX = viewport.width * COVER
      const spanY = viewport.height * COVER
      svg.style.display = ''
      path.setAttribute(
        'd',
        `M${-spanX},${-spanY}H${spanX}V${spanY}H${-spanX}Z` +
          `M${hole.x},${hole.y}h${hole.width}v${hole.height}h${-hole.width}Z`
      )
      path.setAttribute('fill-opacity', String(strength))
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
