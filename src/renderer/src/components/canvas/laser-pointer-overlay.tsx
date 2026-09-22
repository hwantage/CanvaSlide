import { useLayoutEffect, useRef } from 'react'
import {
  selectPointing,
  usePresentationAnnotationStore
} from '@/store/presentation-annotation-store'
import { selectSlideShowActive, usePresentationStore } from '@/store/presentation-store'

/**
 * A soft dot under the cursor while presenting, and the nib of the pen: pointing and drawing are one
 * tool. It is screen space on purpose — the laser points at whatever the audience is looking at, so
 * it must not travel with the world the way the ink it leaves behind does.
 */
export function LaserPointerOverlay() {
  const active = usePresentationStore(selectSlideShowActive)
  const armed = usePresentationAnnotationStore(selectPointing)
  const layerRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)

  // Why: a pointer move must not cost a render, so the dot is positioned by hand, like the stage.
  useLayoutEffect(() => {
    const layer = layerRef.current
    const dot = dotRef.current
    if (!active || !armed || !layer || !dot) {
      return
    }
    // The layer fills the viewport and never rolls, so its origin holds for the whole show.
    let origin = layer.getBoundingClientRect()
    let shown = false
    const remeasure = () => {
      origin = layer.getBoundingClientRect()
    }
    const onMove = (event: PointerEvent) => {
      // Why: translate3d keeps the dot on the compositor, so a move is a transform and not a paint.
      dot.style.transform = `translate3d(${event.clientX - origin.left}px, ${
        event.clientY - origin.top
      }px, 0)`
      if (!shown) {
        shown = true
        dot.style.opacity = '1'
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('resize', remeasure)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('resize', remeasure)
    }
  }, [active, armed])

  if (!active || !armed) {
    return null
  }
  return (
    <div
      ref={layerRef}
      aria-hidden
      data-testid="laser-pointer-layer"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Hidden until the pointer first moves, so the dot never appears in a stale corner. */}
      <div
        ref={dotRef}
        data-testid="laser-pointer"
        className="laser-pointer"
        style={{ opacity: 0 }}
      />
    </div>
  )
}
