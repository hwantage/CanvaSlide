/** What a pointer swipe does inside a running slide show; the app and the export player agree on it. */
export type PresentationSwipeAction = 'next' | 'previous'

export type SwipePoint = { x: number; y: number; time: number }

/** Horizontal travel a flick needs before it steps the deck. */
export const SWIPE_MIN_TRAVEL_PX = 48
/** Past this the gesture is a deliberate drag, not a flick, and is left alone. */
export const SWIPE_MAX_DURATION_MS = 600
/** How far a flick must lean horizontally: |dx| >= ratio * |dy|. */
export const SWIPE_HORIZONTAL_RATIO = 1.5

/**
 * Elements that own their own gestures: a swipe starting here belongs to them, never to the deck.
 * Both surfaces add their own chrome selector (the player's nav bar, the app's canvas UI).
 */
export const SWIPE_INTERACTIVE_SELECTOR = 'a, button, input, select, textarea, video, iframe'

/**
 * Maps one finished pointer gesture onto a navigation step. Only a short horizontal flick counts;
 * slow drags, vertical travel and taps are left to the slide, so interacting with its content
 * never advances the deck.
 */
export function presentationSwipeAction(
  start: SwipePoint,
  end: SwipePoint
): PresentationSwipeAction | null {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (end.time - start.time > SWIPE_MAX_DURATION_MS || Math.abs(dx) < SWIPE_MIN_TRAVEL_PX) {
    return null
  }
  if (Math.abs(dx) < SWIPE_HORIZONTAL_RATIO * Math.abs(dy)) {
    return null
  }
  // Why: the deck follows the finger — dragging the slide leftwards brings the next frame in.
  return dx < 0 ? 'next' : 'previous'
}
