import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'
import type { Point } from '@shared/canvas/element-types'
import { placePopoverBelow } from '@shared/ui/menu-placement'

export function useAnchoredPopover(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  popoverRef: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  /** Anything that changes the popover's size while open (a growing list); re-places it. */
  sizeKey: unknown = null
): Point | null {
  const [placement, setPlacement] = useState<Point | null>(null)

  // Why: capture dismisses before canvas shortcuts or outside pointer handlers run.
  useEffect(() => {
    if (!open) {
      return
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) {
        onDismiss()
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onDismiss()
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open, anchorRef, onDismiss])

  // Why: fixed positioning avoids clipping by the side panel's scrolling container.
  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !popoverRef.current) {
      setPlacement(null)
      return
    }
    const anchor = anchorRef.current.getBoundingClientRect()
    const { offsetWidth, offsetHeight } = popoverRef.current
    setPlacement(
      placePopoverBelow(
        { x: anchor.left, y: anchor.top, width: anchor.width, height: anchor.height },
        { width: offsetWidth, height: offsetHeight },
        { width: window.innerWidth, height: window.innerHeight }
      )
    )
  }, [open, anchorRef, popoverRef, sizeKey])

  return placement
}

/** Style for the popover: parked hidden at the origin until its size has been measured. */
export function popoverStyle(placement: Point | null) {
  return placement
    ? { left: placement.x, top: placement.y }
    : { left: 0, top: 0, visibility: 'hidden' as const }
}
