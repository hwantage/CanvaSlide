import { useLayoutEffect, useRef } from 'react'
import {
  inkPointSpacing,
  presentationWorldPoint,
  viewportOriginFromStage
} from '@shared/canvas/presentation-ink'
import { createInkPainter } from '@/lib/presentation-ink-painter'
import { useCameraStore } from '@/store/camera-store'
import {
  selectPointing,
  usePresentationAnnotationStore
} from '@/store/presentation-annotation-store'
import {
  selectPresentationRoll,
  selectSlideShowActive,
  usePresentationStore
} from '@/store/presentation-store'

/**
 * Temporary ink. It lives inside `PresentationStage`, so strokes roll with the world, and its own
 * group rides the camera — a stroke stays put on the slide it was drawn on for as long as the show
 * is on that slide. Nothing here reaches the document: no `applyEdit`, no history, nothing on exit.
 */
export function PresentationInkOverlay() {
  const active = usePresentationStore(selectSlideShowActive)
  const armed = usePresentationAnnotationStore(selectPointing)
  const svgRef = useRef<SVGSVGElement>(null)
  const groupRef = useRef<SVGGElement>(null)
  const painterRef = useRef<ReturnType<typeof createInkPainter> | null>(null)

  // The painter outlives the pointer: strokes drawn before putting it away stay on screen.
  useLayoutEffect(() => {
    const group = groupRef.current
    if (!active || !group) {
      return
    }
    const painter = createInkPainter(group)
    painterRef.current = painter
    // Why: the camera moves every frame of a flight, so the group is written to, not re-rendered.
    const applyCamera = () => {
      const { camera } = useCameraStore.getState()
      group.setAttribute('transform', `translate(${camera.x} ${camera.y}) scale(${camera.zoom})`)
    }
    applyCamera()
    const unsubscribeCamera = useCameraStore.subscribe(applyCamera)
    // A stroke belongs to the slide it was drawn on; leaving that slide wipes it. An overview and
    // back is not leaving: the ink rides the camera out and in, still on its own frame.
    const unsubscribeFrame = usePresentationStore.subscribe((state, previous) => {
      if (state.index !== previous.index) {
        painter.clear()
      }
    })
    const unsubscribeClear = usePresentationAnnotationStore.subscribe((state, previous) => {
      if (state.clearCount !== previous.clearCount) {
        painter.clear()
      }
    })
    return () => {
      unsubscribeCamera()
      unsubscribeFrame()
      unsubscribeClear()
      painter.clear()
      painterRef.current = null
    }
  }, [active])

  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!active || !armed || !svg) {
      return
    }
    let drawing = -1
    let origin = { x: 0, y: 0 }
    // Why: reading layout per move would force a reflow inside the drag. The stage rolls about the
    // viewport centre, so its box grows but its centre — and therefore this origin — holds.
    const measure = () => {
      const { viewport } = useCameraStore.getState()
      origin = viewportOriginFromStage(svg.getBoundingClientRect(), viewport)
    }
    const worldAt = (event: PointerEvent) => {
      const { camera, viewport } = useCameraStore.getState()
      return presentationWorldPoint(
        { x: event.clientX - origin.x, y: event.clientY - origin.y },
        camera,
        viewport,
        selectPresentationRoll(usePresentationStore.getState())
      )
    }
    const onDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0 || drawing !== -1) {
        return
      }
      // The control bar and the overview frame buttons stay clickable while the pointer is out.
      if (event.target instanceof Element && event.target.closest('[data-canvas-ui]')) {
        return
      }
      measure()
      drawing = event.pointerId
      painterRef.current?.begin(worldAt(event))
      event.preventDefault()
    }
    const finish = () => {
      drawing = -1
      painterRef.current?.end()
    }
    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== drawing) {
        return
      }
      // Why: a release outside the window sends no pointerup, and the stroke would latch onto the
      // cursor. The editor's own pointer session guards the same case (see use-canvas-interaction).
      if ((event.buttons & 1) === 0) {
        finish()
        return
      }
      painterRef.current?.extend(
        worldAt(event),
        inkPointSpacing(useCameraStore.getState().camera.zoom)
      )
    }
    const onUp = (event: PointerEvent) => {
      if (event.pointerId === drawing) {
        finish()
      }
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onUp, true)
    window.addEventListener('blur', finish)
    return () => {
      finish()
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onUp, true)
      window.removeEventListener('blur', finish)
    }
  }, [active, armed])

  if (!active) {
    return null
  }
  return (
    <svg
      ref={svgRef}
      aria-hidden
      data-testid="presentation-ink"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
    >
      <g ref={groupRef} />
    </svg>
  )
}
