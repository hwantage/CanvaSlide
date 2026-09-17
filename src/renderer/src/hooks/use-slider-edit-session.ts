import { useCallback, useEffect, useRef } from 'react'
import { useDocumentStore } from '@/store/document-store'

/**
 * A range input fires `change` on every step it crosses, and recording each one would push a
 * slider's worth of whole-document snapshots — burying the edit before it, since history keeps only
 * the last `HISTORY_LIMIT`. Open the session on the first change, patch unrecorded while it moves,
 * and the release closes it into one undo step. The pointer is routinely let go off the input, so
 * the release is watched on the window.
 */
export function useSliderEditSession(): { begin: () => void; end: () => void } {
  const open = useRef(false)
  const end = useCallback(() => {
    if (open.current) {
      open.current = false
      useDocumentStore.getState().endEdit()
    }
  }, [])
  const begin = useCallback(() => {
    if (!open.current) {
      open.current = true
      useDocumentStore.getState().beginEdit()
    }
  }, [])
  useEffect(() => {
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    window.addEventListener('keyup', end)
    return () => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('keyup', end)
      // Why: unmounting mid-drag (the dialog closes, Advanced collapses) would otherwise leave the
      // session open and swallow every later edit into the one undo step it is still holding.
      end()
    }
  }, [end])
  return { begin, end }
}
