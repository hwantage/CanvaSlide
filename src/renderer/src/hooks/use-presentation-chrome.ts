import { useEffect, useRef, useState } from 'react'
import {
  createChromeAutoHide,
  type ChromeAutoHide,
  type ChromeHold
} from '@/lib/presentation-chrome-auto-hide'

/**
 * Feeds the window's pointer to the chrome auto-hide while `presenting`, and hands back the
 * current visibility plus the hold the bar itself reports (hover, focus). Every timer lives in
 * the auto-hide, so the bar only has to paint what it is told.
 */
export function usePresentationChrome(presenting: boolean): {
  visible: boolean
  hold: (reason: ChromeHold, held: boolean) => void
} {
  const [visible, setVisible] = useState(true)
  const [presented, setPresented] = useState(presenting)
  // Every show opens with its controls up, however the previous one left them.
  if (presented !== presenting) {
    setPresented(presenting)
    setVisible(true)
  }
  const autoHide = useRef<ChromeAutoHide | null>(null)
  useEffect(() => {
    if (!presenting) {
      return
    }
    const chrome = createChromeAutoHide(setVisible)
    autoHide.current = chrome
    const onPointerMove = (event: PointerEvent) =>
      chrome.pointerMovedTo(event.clientY, window.innerHeight)
    // Why: touch and pen never hover, so a tap is the only way an audience can call the bar back.
    const onPointerDown = () => chrome.reveal()
    // Why: a hidden bar is out of the tab order, so Tab is the keyboard's only way to ask for it.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        chrome.reveal()
      }
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerdown', onPointerDown, { passive: true })
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      chrome.dispose()
      autoHide.current = null
    }
  }, [presenting])
  return {
    visible,
    hold: (reason, held) => autoHide.current?.hold(reason, held)
  }
}
