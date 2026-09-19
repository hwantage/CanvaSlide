import { videoAspectRatio } from '@shared/canvas/video-placement'
import type { VideoSource } from '@shared/canvas/video-source'

function directAspectRatio(url: string, signal: AbortSignal): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const finish = (ratio: number | null) => {
      video.onloadedmetadata = null
      video.onerror = null
      signal.removeEventListener('abort', abort)
      video.removeAttribute('src')
      video.load()
      resolve(ratio)
    }
    const abort = () => finish(null)
    signal.addEventListener('abort', abort, { once: true })
    video.onloadedmetadata = () => finish(videoAspectRatio(video.videoWidth, video.videoHeight))
    video.onerror = () => finish(null)
    video.preload = 'metadata'
    video.muted = true
    video.src = url
    video.load()
    if (signal.aborted) {
      abort()
    }
  })
}

/** Read only dimensions; never play, attach, persist media bytes or insert provider HTML. */
export async function readVideoAspectRatio(
  source: VideoSource,
  signal: AbortSignal
): Promise<number | null> {
  if (signal.aborted) {
    return null
  }
  if (source.provider === 'direct') {
    return directAspectRatio(source.url, signal)
  }
  const endpoint = new URL(
    source.provider === 'youtube'
      ? 'https://www.youtube.com/oembed'
      : 'https://vimeo.com/api/oembed.json'
  )
  endpoint.searchParams.set('url', source.url)
  endpoint.searchParams.set('format', 'json')
  try {
    const response = await fetch(endpoint, { signal, credentials: 'omit' })
    if (!response.ok) {
      return null
    }
    const value: unknown = await response.json()
    if (!value || typeof value !== 'object') {
      return null
    }
    const dimensions = value as { width?: unknown; height?: unknown }
    return videoAspectRatio(dimensions.width, dimensions.height)
  } catch {
    return null
  }
}
