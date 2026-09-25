/** Fullscreen and window resizes arrive as a burst; the presentation refits once it settles. */
export const REFIT_DELAY_MS = 60

/**
 * Coalesces viewport resizes into one presentation refit. An expanded video owns the view, so it
 * refits at once and no slide refit is queued behind its return button.
 */
export function createViewportRefit(target: { refitMedia: () => boolean; refit: () => void }) {
  let timer: ReturnType<typeof setTimeout> | null = null
  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }
  return {
    request: () => {
      cancel()
      if (target.refitMedia()) {
        return
      }
      timer = setTimeout(() => {
        timer = null
        if (!target.refitMedia()) {
          target.refit()
        }
      }, REFIT_DELAY_MS)
    },
    cancel
  }
}
