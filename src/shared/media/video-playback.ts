import type { CanvasDocument, VideoElement } from '../canvas/element-types'
import { withFrameContents } from '../canvas/frame-contents'
import { parseVideoSource } from '../canvas/video-source'

/** Match frame dragging's containment and copied-frame ownership rules. */
export function frameVideos(document: CanvasDocument, frameId: string | null): VideoElement[] {
  if (!frameId || document.elements[frameId]?.type !== 'frame') {
    return []
  }
  return withFrameContents(document, [frameId]).flatMap((id) => {
    const element = document.elements[id]
    return element?.type === 'video' ? [element] : []
  })
}

/** YouTube permits only one automatically playing embed on a screen. */
export function autoplayVideoIds(videos: readonly VideoElement[]): string[] {
  let youtube = false
  return videos
    .filter((video) => {
      if (video.autoplay === false) {
        return false
      }
      if (parseVideoSource(video.url, true)?.provider !== 'youtube') {
        return true
      }
      if (youtube) {
        return false
      }
      youtube = true
      return true
    })
    .map((video) => video.id)
}
