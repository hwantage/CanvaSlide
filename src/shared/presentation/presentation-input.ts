import { SWIPE_INTERACTIVE_SELECTOR } from '../canvas/presentation-swipe'

export const PRESENTATION_UI = '[data-canvas-ui], [data-presentation-ui]'
const CONTENT_INPUT = `${SWIPE_INTERACTIVE_SELECTOR}, [role="dialog"], [data-video-id], .linked-video`

export function ownsPresentationPointer(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest(`${PRESENTATION_UI}, ${CONTENT_INPUT}`) !== null
  )
}

export function ownsPresentationKey(event: KeyboardEvent): boolean {
  if (
    event.defaultPrevented ||
    ['Alt', 'Control', 'Meta'].some((key) => event.getModifierState(key))
  ) {
    return true
  }
  const target = event.target
  if (!(target instanceof Element)) {
    return false
  }
  if (target.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"])')) {
    return true
  }
  if (target.closest(PRESENTATION_UI)) {
    return (event.key === ' ' || event.key === 'Enter') && target.closest('button') !== null
  }
  return target.closest(CONTENT_INPUT) !== null
}
