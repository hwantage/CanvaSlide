import { useEffect } from 'react'
import { edgeScrollVelocity } from '@shared/ui/list-drop-gap'

/** Pointer this close (px) to the pane's top or bottom edge scrolls it while dragging. */
const EDGE_ZONE_PX = 40

/**
 * While `active`, follows the pointer through document-level `dragover` events and scrolls
 * `pane` every animation frame when the pointer sits near its top or bottom edge. Why: native
 * HTML5 drag never scrolls a small pane, and `dragover` alone fires too rarely to feel smooth.
 */
export function useDragAutoScroll(active: boolean, pane: () => HTMLElement | null): void {
  useEffect(() => {
    const element = active ? pane() : null
    if (!element) {
      return
    }
    let velocity = 0
    let frame = 0
    const tick = () => {
      if (velocity !== 0) {
        element.scrollTop += velocity
      }
      frame = requestAnimationFrame(tick)
    }
    const onDragOver = (event: DragEvent) => {
      const rect = element.getBoundingClientRect()
      const fromTop = rect.top + EDGE_ZONE_PX - event.clientY
      const fromBottom = event.clientY - (rect.bottom - EDGE_ZONE_PX)
      if (event.clientX < rect.left || event.clientX > rect.right) {
        velocity = 0
      } else if (fromTop > 0) {
        velocity = -edgeScrollVelocity(fromTop, EDGE_ZONE_PX)
      } else if (fromBottom > 0) {
        velocity = edgeScrollVelocity(fromBottom, EDGE_ZONE_PX)
      } else {
        velocity = 0
      }
    }
    document.addEventListener('dragover', onDragOver)
    frame = requestAnimationFrame(tick)
    return () => {
      document.removeEventListener('dragover', onDragOver)
      cancelAnimationFrame(frame)
    }
  }, [active, pane])
}
