import type { Camera, Rect, Size } from '../canvas/element-types'
import { LEVEL_SHOT, type Shot } from '../canvas/presentation-shot'

export type VideoView = { camera: Camera; shot: Shot }
export type VideoFocusHandle = { close: () => void; dispose: () => void }

/** Fits the video without replacing its browsing context or changing its saved geometry. */
export function createVideoFocus(access: {
  getView: () => VideoView
  setView: (view: VideoView) => void
  getRect: (id: string) => Rect | null
  getViewport: () => Size
  /** Called after a closed video hands back the view it replaced, which may no longer fit. */
  onRestore?: () => void
}) {
  let current: {
    id: string
    before: VideoView
    onClose: () => void
    resize: (height: number, zoom: number) => void
  } | null = null
  const close = (restore: boolean, reportRestore = restore) => {
    const previous = current
    current = null
    if (previous) {
      if (restore) {
        access.setView(previous.before)
      }
      previous.onClose()
      if (reportRestore) {
        access.onRestore?.()
      }
    }
  }
  const refit = () => {
    const rect = current && access.getRect(current.id)
    if (!rect) {
      return false
    }
    const viewport = access.getViewport()
    const zoom = viewport.width / Math.max(1, rect.width)
    current!.resize(viewport.height / zoom, zoom)
    access.setView({
      camera: { x: -rect.x * zoom, y: -rect.y * zoom, zoom },
      shot: LEVEL_SHOT
    })
    return true
  }
  return {
    refit,
    open: (
      id: string,
      onClose: () => void,
      resize: (height: number, zoom: number) => void
    ): VideoFocusHandle => {
      // Why: the next video takes the view over at once, so nothing needs to refit in between.
      close(true, false)
      const focus = { id, before: access.getView(), onClose, resize }
      current = focus
      if (!refit()) {
        close(false)
      }
      const finish = (restore: boolean) => {
        if (current === focus) {
          close(restore)
        }
      }
      return { close: () => finish(true), dispose: () => finish(false) }
    }
  }
}
