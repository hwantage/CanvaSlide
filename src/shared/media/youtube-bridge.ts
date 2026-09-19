import type { VideoSource } from '../canvas/video-source'
import type { PlaybackStatus, ProviderPlayer } from './provider-player'

/** The desktop bridge is an isolated HTTP page; only this iframe may report playback state. */
export function attachYouTubeBridge(
  iframe: HTMLIFrameElement,
  origin: string,
  source: VideoSource,
  muted: boolean,
  status: (value: PlaybackStatus) => void
): ProviderPlayer {
  let requestedMuted = muted
  let requestedPlaying = true
  let ready = false
  const command = (command: string) => {
    if (ready) {
      iframe.contentWindow?.postMessage({ channel: 'canvaslide-video', command }, origin)
    }
  }
  const onMessage = (event: MessageEvent) => {
    if (
      event.source !== iframe.contentWindow ||
      event.origin !== origin ||
      event.data?.channel !== 'canvaslide-video'
    ) {
      return
    }
    const value: unknown = event.data.status
    if (value === 'ready') {
      ready = true
      command(requestedMuted ? 'mute' : 'unmute')
      command(requestedPlaying ? 'play' : 'pause')
    }
    if (value === 'playing' || value === 'paused' || value === 'blocked' || value === 'error') {
      status(value)
    }
  }
  window.addEventListener('message', onMessage)
  const params = new URLSearchParams({
    id: source.id!,
    start: String(source.start),
    muted: muted ? '1' : '0',
    parent: location.origin
  })
  iframe.src = `${origin}/youtube.html#${params}`
  return {
    mute: (value) => {
      requestedMuted = value
      command(value ? 'mute' : 'unmute')
    },
    play: () => {
      requestedPlaying = true
      command('play')
    },
    pause: () => {
      requestedPlaying = false
      command('pause')
    },
    destroy: () => {
      window.removeEventListener('message', onMessage)
      iframe.remove()
    }
  }
}
