import type { VideoSource } from '../canvas/video-source'

export type PlaybackStatus = 'loading' | 'playing' | 'paused' | 'blocked' | 'error'
export function playbackFailure(error: unknown): PlaybackStatus {
  return error instanceof Error && error.name === 'NotAllowedError' ? 'blocked' : 'error'
}
export type ProviderPlayer = {
  mute: (muted: boolean) => void
  play: () => void
  pause: () => void
  destroy: () => void
}
type YouTubePlayer = {
  mute: () => void
  unMute: () => void
  playVideo: () => void
  pauseVideo: () => void
  destroy: () => void
}
type VimeoPlayer = {
  on: (name: string, callback: () => void) => void
  ready: () => Promise<void>
  play: () => Promise<void>
  pause: () => Promise<void>
  setMuted: (muted: boolean) => Promise<void>
  destroy: () => Promise<void>
}
type ProviderWindow = Window & {
  YT?: {
    Player: new (
      node: HTMLIFrameElement,
      options: {
        events: {
          onReady: (event: { target: YouTubePlayer }) => void
          onStateChange: (event: { data: number }) => void
          onError: () => void
          onAutoplayBlocked: () => void
        }
      }
    ) => YouTubePlayer
  }
  Vimeo?: { Player: new (node: HTMLIFrameElement) => VimeoPlayer }
  onYouTubeIframeAPIReady?: () => void
}
const providerWindow = () => window as ProviderWindow
const scripts = new Map<string, Promise<void>>()

/** Only official SDKs handle the providers' message protocols. Loaded on first playback. */
function loadSdk(provider: 'youtube' | 'vimeo'): Promise<void> {
  if (provider === 'youtube' ? providerWindow().YT?.Player : providerWindow().Vimeo?.Player) {
    return Promise.resolve()
  }
  const existing = scripts.get(provider)
  if (existing) {
    return existing
  }
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    let settled = false
    const finish = (error?: Error) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      script.onerror = null
      if (error) {
        script.remove()
        reject(error)
      } else {
        resolve()
      }
    }
    const timer = setTimeout(() => finish(new Error('Provider SDK timeout')), 15000)
    if (provider === 'youtube') {
      const previous = providerWindow().onYouTubeIframeAPIReady
      providerWindow().onYouTubeIframeAPIReady = () => {
        previous?.()
        finish()
      }
      script.src = 'https://www.youtube.com/iframe_api'
    } else {
      script.src = 'https://player.vimeo.com/api/player.js'
      script.onload = () => finish()
    }
    script.onerror = () => finish(new Error('Provider SDK unavailable'))
    script.referrerPolicy = 'strict-origin-when-cross-origin'
    document.head.append(script)
  })
  scripts.set(provider, promise)
  void promise.catch(() => scripts.delete(provider))
  return promise
}

export async function attachProviderPlayer(
  iframe: HTMLIFrameElement,
  source: VideoSource,
  muted: boolean,
  alive: () => boolean,
  status: (status: PlaybackStatus) => void
): Promise<ProviderPlayer | null> {
  if (source.provider === 'direct') {
    return null
  }
  await loadSdk(source.provider)
  if (!alive()) {
    return null
  }
  const update = (next: PlaybackStatus) => {
    if (alive()) {
      status(next)
    }
  }
  if (source.provider === 'youtube') {
    let ready = false
    let requestedMuted = muted
    let requestedPlaying = true
    const player = new (providerWindow().YT!.Player)(iframe, {
      events: {
        onReady: ({ target }) => {
          if (!alive()) {
            return
          }
          ready = true
          if (requestedMuted) {
            target.mute()
          } else {
            target.unMute()
          }
          if (requestedPlaying) {
            target.playVideo()
          } else {
            target.pauseVideo()
          }
        },
        onStateChange: ({ data }) => {
          if (data === 1) {
            update('playing')
          } else if (data === 0 || data === 2) {
            update('paused')
          }
        },
        onError: () => update('error'),
        onAutoplayBlocked: () => update('blocked')
      }
    })
    return {
      play: () => {
        requestedPlaying = true
        if (ready) {
          player.playVideo()
        }
      },
      pause: () => {
        requestedPlaying = false
        if (ready) {
          player.pauseVideo()
        }
      },
      mute: (next) => {
        requestedMuted = next
        if (ready) {
          if (next) {
            player.mute()
          } else {
            player.unMute()
          }
        }
      },
      destroy: () => {
        try {
          player.destroy()
        } catch {
          // Removing the browsing context stops playback even when SDK teardown fails.
          iframe.remove()
        }
      }
    }
  }
  const player = new (providerWindow().Vimeo!.Player)(iframe)
  let requestedMuted = muted
  let requestedPlaying = true
  let ready = false
  const applyPlayback = () =>
    (requestedPlaying ? player.play() : player.pause()).catch((error: unknown) =>
      update(playbackFailure(error))
    )
  player.on('play', () => update('playing'))
  player.on('pause', () => update('paused'))
  player.on('ended', () => update('paused'))
  player.on('error', () => update('error'))
  void player
    .ready()
    .then(async () => {
      if (!alive()) {
        return
      }
      await player.setMuted(requestedMuted)
      if (alive()) {
        ready = true
        await applyPlayback()
      }
    })
    .catch((error: unknown) => update(playbackFailure(error)))
  return {
    play: () => {
      requestedPlaying = true
      if (ready) {
        void applyPlayback()
      }
    },
    pause: () => {
      requestedPlaying = false
      if (ready) {
        void applyPlayback()
      }
    },
    mute: (next) => {
      requestedMuted = next
      void player.setMuted(next).catch((error: unknown) => update(playbackFailure(error)))
    },
    destroy: () => {
      void player.destroy().catch(() => undefined)
    }
  }
}
