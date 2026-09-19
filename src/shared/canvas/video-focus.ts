import type { Camera, Rect, Size } from './element-types'
import { LEVEL_SHOT, type Shot } from './presentation-shot'

export type VideoView = { camera: Camera; shot: Shot }
export type VideoFocusHandle = { close: () => void; dispose: () => void }

/** Fits the video without replacing its browsing context or changing its saved geometry. */
export function createVideoFocus(access: {
  getView: () => VideoView
  setView: (view: VideoView) => void
  getRect: (id: string) => Rect | null
  getViewport: () => Size
}) {
  let current: {
    id: string
    before: VideoView
    onClose: () => void
    resize: (height: number, zoom: number) => void
  } | null = null
  const close = (restore: boolean) => {
    const previous = current
    current = null
    if (previous) {
      if (restore) {
        access.setView(previous.before)
      }
      previous.onClose()
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
      close(true)
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
