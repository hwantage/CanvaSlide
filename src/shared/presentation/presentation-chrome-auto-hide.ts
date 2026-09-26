/** How long the pointer must rest before the presentation chrome slides away. */
export const CHROME_IDLE_MS = 1500
/**
 * Height of the strip along the viewport's bottom edge that brings the chrome back. It is barely
 * taller than the bar itself: the pointer has to go for the controls, not merely drift low.
 */
export const CHROME_HOT_ZONE_PX = 48

/** Is `y`, in px from the viewport top, inside the strip that reveals the chrome? */
export function inChromeHotZone(
  y: number,
  viewportHeight: number,
  hotZonePx: number = CHROME_HOT_ZONE_PX
): boolean {
  return y >= viewportHeight - hotZonePx
}

/** Why the chrome is pinned open: the pointer rests on it, or the keyboard is inside it. */
export type ChromeHold = 'pointer' | 'focus' | 'menu'

export type ChromeAutoHide = {
  /** The pointer moved to `y` in a viewport `viewportHeight` px tall. */
  pointerMovedTo: (y: number, viewportHeight: number) => void
  /** An explicit keyboard request to put the chrome back on screen. */
  reveal: () => void
  hold: (reason: ChromeHold, held: boolean) => void
  dispose: () => void
}

type Options = { idleMs?: number; hotZonePx?: number }

/**
 * Decides when a slide show's controls are on screen, the way a video player does: they leave once
 * the pointer has been still for `idleMs`, and come back when it reaches the bottom hot zone or the
 * keyboard requests them. Movement elsewhere only restarts the idle wait, so pointing at the slide never
 * pops the chrome up. While a hold is on — the pointer rests on the bar, or focus sits inside it —
 * no timer runs, so the bar cannot vanish under the cursor or strand the keyboard.
 */
export function createChromeAutoHide(
  onVisibilityChange: (visible: boolean) => void,
  { idleMs = CHROME_IDLE_MS, hotZonePx = CHROME_HOT_ZONE_PX }: Options = {}
): ChromeAutoHide {
  const holds = new Set<ChromeHold>()
  let visible = true
  let idleSince = Date.now()
  let timer: ReturnType<typeof setTimeout> | null = null
  const clearIdle = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }
  const setVisible = (next: boolean) => {
    if (visible !== next) {
      visible = next
      onVisibilityChange(next)
    }
  }
  const hideWhenIdle = () => {
    // Why: movement only pushes the deadline out, so a busy pointer re-arms one timer instead of
    // replacing it on every event.
    const remaining = idleSince + idleMs - Date.now()
    if (remaining > 0) {
      timer = setTimeout(hideWhenIdle, remaining)
      return
    }
    timer = null
    setVisible(false)
  }
  const armIdle = () => {
    idleSince = Date.now()
    if (!visible || holds.size > 0) {
      clearIdle()
      return
    }
    timer ??= setTimeout(hideWhenIdle, idleMs)
  }
  const reveal = () => {
    setVisible(true)
    armIdle()
  }
  // The chrome opens with the show and starts counting down straight away.
  armIdle()
  return {
    pointerMovedTo: (y, viewportHeight) => {
      if (visible || inChromeHotZone(y, viewportHeight, hotZonePx)) {
        reveal()
      }
    },
    reveal,
    hold: (reason, held) => {
      if (held) {
        holds.add(reason)
        setVisible(true)
      } else {
        holds.delete(reason)
      }
      armIdle()
    },
    dispose: clearIdle
  }
}
