import { useEffect, type RefObject } from 'react'
import { bindSwipeNavigation } from '@shared/presentation/swipe-navigation'
import { usePresentationStore } from '@/store/presentation-store'

/**
 * Touch and pen swipes step a running slide show, through the same binder the exported player
 * uses. The canvas pointer session already ignores everything while presenting, so this never
 * competes with panning, selection or the tools.
 */
export function useSwipeNavigation(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const node = ref.current
    if (!node) {
      return
    }
    return bindSwipeNavigation(node, {
      isNavigable: () => {
        const presentation = usePresentationStore.getState()
        return presentation.active && !presentation.overview
      },
      next: () => usePresentationStore.getState().next(),
      previous: () => usePresentationStore.getState().previous(),
      chromeSelector: '[data-canvas-ui]'
    })
  }, [ref])
}
