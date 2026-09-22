import type { createVideoFocus } from '@shared/canvas/video-focus'
import type { CanvasDocument } from '@shared/canvas/element-types'
import { autoplayVideoIds, frameVideos } from '@shared/canvas/video-playback'
import { mountLinkedVideo, type VideoLabels } from '@shared/media/linked-video'

const labels: VideoLabels = {
  play: 'Play video',
  pause: 'Pause video',
  resume: 'Resume video',
  expand: 'Expand video',
  collapse: 'Return to previous view',
  sound: 'Enable sound',
  mute: 'Mute',
  loading: 'Loading video…',
  blocked: 'Use the player’s Play button to start playback.',
  error: 'Video unavailable. Check the link, connection, format or embedding permissions.',
  retry: 'Retry',
  open: 'Open original',
  thumbnail: 'YouTube video thumbnail',
  linked: 'Linked video'
}

export function createPlayerVideos(
  doc: CanvasDocument,
  root: HTMLElement,
  focus: ReturnType<typeof createVideoFocus>
) {
  const nodes = new Map(
    [...root.querySelectorAll<HTMLElement>('[data-video-id]')].map((node) => [
      node.dataset.videoId!,
      node
    ])
  )
  const cleanups = new Map<string, () => void>()
  let current: string | null | undefined
  const show = (frameId: string | null) => {
    if (current === frameId) {
      return
    }
    current = frameId
    for (const cleanup of cleanups.values()) {
      cleanup()
    }
    cleanups.clear()
    const videos = frameVideos(doc, frameId)
    const members = new Set(videos.map((video) => video.id))
    const automatic = new Set(autoplayVideoIds(videos))
    for (const [id, node] of nodes) {
      const video = doc.elements[id]
      if (video?.type !== 'video') {
        continue
      }
      cleanups.set(
        id,
        mountLinkedVideo(node, {
          url: video.url,
          expand: (onClose, resize) => focus.open(id, onClose, resize),
          labels,
          interactive: members.has(id),
          autoplay: automatic.has(id),
          filePlaybackHint:
            'YouTube requires a web address. Serve this HTML over HTTP(S) to play it here, or open the original video.'
        })
      )
    }
  }
  show(null)
  return {
    show,
    dispose: () => {
      for (const cleanup of cleanups.values()) {
        cleanup()
      }
      cleanups.clear()
    }
  }
}
