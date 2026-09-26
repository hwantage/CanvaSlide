import { presentationSwipeAction, type SwipePoint } from './presentation-swipe'
import { ownsPresentationPointer } from './presentation-input'

/** What a surface must tell the binder to take swipes; the app and the player both supply it. */
export type SwipeNavigation = {
  /** True while a slide show is taking gestures — false in the overview and outside a show. */
  isNavigable: () => boolean
  next: () => void
  previous: () => void
  /** Chrome that owns its gestures here: the player's nav bar, the app's canvas overlays. */
  chromeSelector: string
}

function point(event: PointerEvent): SwipePoint {
  return { x: event.clientX, y: event.clientY, time: event.timeStamp }
}

/**
 * Steps a slide show on a touch or pen flick, and on nothing else: taps, mouse drags and two
 * fingers are left to the slide, so its own content keeps every interaction. One implementation
 * so the exported HTML and the app cannot drift apart. Returns a disposer.
 */
export function bindSwipeNavigation(node: HTMLElement, navigation: SwipeNavigation): () => void {
  let start: { pointerId: number; at: SwipePoint } | null = null

  const owns = (target: EventTarget | null) =>
    ownsPresentationPointer(target) ||
    (target instanceof Element && target.closest(navigation.chromeSelector) !== null)

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') {
      return
    }
    // Why: a second finger is a pinch, and chrome or slide content keeps its own gestures.
    if (
      event.defaultPrevented ||
      !event.isPrimary ||
      !navigation.isNavigable() ||
      owns(event.target)
    ) {
      start = null
      return
    }
    start = { pointerId: event.pointerId, at: point(event) }
  }

  const release = (event: PointerEvent, navigate: boolean) => {
    const from = start
    if (!from || from.pointerId !== event.pointerId) {
      return
    }
    start = null
    if (!navigate || !navigation.isNavigable()) {
      return
    }
    switch (presentationSwipeAction(from.at, point(event))) {
      case 'next':
        navigation.next()
        break
      case 'previous':
        navigation.previous()
        break
      case null:
        break
    }
  }

  const onPointerUp = (event: PointerEvent) =>
    release(event, event.target instanceof Node && node.contains(event.target))
  const onBlur = () => {
    start = null
  }
  const onPointerCancel = (event: PointerEvent) => release(event, false)
  node.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('blur', onBlur)
  node.addEventListener('pointercancel', onPointerCancel)
  return () => {
    node.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('blur', onBlur)
    node.removeEventListener('pointercancel', onPointerCancel)
  }
}
