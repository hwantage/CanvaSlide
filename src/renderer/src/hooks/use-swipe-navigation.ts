import { useEffect, type RefObject } from 'react'
import { bindSwipeNavigation } from '@shared/presentation/swipe-navigation'
import { selectPreviewing, usePresentationStore } from '@/store/presentation-store'

/** Preview gestures stay in the editor; the shared experience owns slide-show gestures. */
export function useSwipeNavigation(ref: RefObject<HTMLElement | null>): void {
  const previewing = usePresentationStore(selectPreviewing)
  useEffect(() => {
    const node = ref.current
    if (!previewing || !node) {
      return
    }
    return bindSwipeNavigation(node, {
      isNavigable: () => {
        const presentation = usePresentationStore.getState()
        return presentation.active && presentation.previewFrameId !== null && !presentation.overview
      },
      next: () => usePresentationStore.getState().next(),
      previous: () => usePresentationStore.getState().previous(),
      chromeSelector: '[data-canvas-ui]'
    })
  }, [ref, previewing])
}
