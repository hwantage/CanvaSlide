import { parseVideoSource, videoEmbedUrl } from '../canvas/video-source'
import {
  attachProviderPlayer,
  playbackFailure,
  type PlaybackStatus,
  type ProviderPlayer
} from './provider-player'
import { attachVideoEmbedBridge } from './video-embed-bridge'
import { labelVideoControl, type VideoControlIcon } from './video-control-icons'
import { showYouTubeThumbnail } from './video-thumbnail'
import type { VideoFocusHandle } from '../canvas/video-focus'

export type VideoLabels = Record<
  | 'play'
  | 'pause'
  | 'resume'
  | 'expand'
  | 'collapse'
  | 'sound'
  | 'mute'
  | 'loading'
  | 'blocked'
  | 'error'
  | 'retry'
  | 'open'
  | 'thumbnail'
  | 'linked',
  string
>
export type VideoOptions = {
  url: string
  labels: VideoLabels
  interactive: boolean
  autoplay: boolean
  openOriginal?: (url: string) => void
  embedOrigin?: () => Promise<string>
  filePlaybackHint?: string
  expand?: (onClose: () => void, resize: (height: number, zoom: number) => void) => VideoFocusHandle
}

/** Owns all media resources so removing a slide also removes its audio and pending callbacks. */
export function mountLinkedVideo(host: HTMLElement, options: VideoOptions): () => void {
  const { labels } = options
  const source = parseVideoSource(options.url, true)
  let disposed = false
  let generation = 0
  let media: HTMLVideoElement | null = null
  let provider: ProviderPlayer | null = null
  let timeout: ReturnType<typeof setTimeout> | undefined
  let observer: IntersectionObserver | undefined
  let autoplayPending = options.autoplay
  let muted = true
  let requestedPlaying = true
  let playbackButton: HTMLButtonElement | null = null
  let expansion: VideoFocusHandle | null = null
  let expansionButton: HTMLButtonElement | null = null
  host.classList.add('linked-video')
  const surface = document.createElement('div')
  surface.className = 'linked-video-surface'
  const footer = document.createElement('div')
  footer.className = 'linked-video-footer'
  const message = document.createElement('span')
  message.setAttribute('role', 'status')
  const actions = document.createElement('div')
  actions.className = 'linked-video-actions'
  actions.dataset.canvasUi = ''
  actions.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
      event.stopPropagation()
    }
  })
  footer.append(message, actions)
  host.replaceChildren(surface, footer)

  const button = (label: string, icon: VideoControlIcon, action: () => void) => {
    const node = document.createElement('button')
    node.type = 'button'
    node.dataset.videoAction = icon
    labelVideoControl(node, label, icon)
    node.addEventListener('click', action)
    return node
  }
  const returnButton = button(labels.collapse, 'collapse', () => expansion?.close())
  returnButton.className = 'linked-video-return'
  returnButton.dataset.canvasUi = ''
  returnButton.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
      event.stopPropagation()
    }
  })
  host.append(returnButton)
  const stopMedia = () => {
    generation++
    playbackButton = null
    clearTimeout(timeout)
    if (media) {
      media.pause()
      media.removeAttribute('src')
      media.load()
      media = null
    }
    provider?.destroy()
    provider = null
    // Removing the browsing context also stops providers whose SDK never became ready.
    surface.replaceChildren()
    delete surface.dataset.canvasUi
    surface.classList.remove('is-playing')
  }
  const status = (value: PlaybackStatus) => {
    host.dataset.playback = value
    if (value !== 'loading') {
      requestedPlaying = value === 'playing'
    }
    if (playbackButton) {
      labelVideoControl(
        playbackButton,
        requestedPlaying ? labels.pause : labels.resume,
        requestedPlaying ? 'pause' : 'resume'
      )
    }
    if (value !== 'loading') {
      clearTimeout(timeout)
    }
    message.textContent = ['loading', 'blocked', 'error'].includes(value)
      ? labels[value as 'loading' | 'blocked' | 'error']
      : ''
    message.title = message.textContent
  }
  const expansionControl = () => {
    expansionButton = button(labels.expand, 'expand', () => {
      if (expansion) {
        expansion.close()
      } else if (options.expand) {
        host.dataset.expanded = 'true'
        expansion = options.expand(
          () => {
            expansion = null
            delete host.dataset.expanded
            host.style.removeProperty('--video-expanded-height')
            host.style.removeProperty('--video-expanded-zoom')
            surface.removeAttribute('tabindex')
            if (media) {
              media.controls = true
            }
            if (!media && !provider) {
              delete surface.dataset.canvasUi
            }
            if (expansionButton) {
              labelVideoControl(expansionButton, labels.expand, 'expand')
            }
          },
          (height, zoom) => {
            host.style.setProperty('--video-expanded-height', `${height}px`)
            host.style.setProperty('--video-expanded-zoom', String(zoom))
          }
        )
        if (media) {
          media.controls = false
        }
        surface.dataset.canvasUi = ''
        labelVideoControl(expansionButton!, labels.collapse, 'collapse')
        surface.tabIndex = 0
        surface.focus({ preventScroll: true })
      }
    })
    if (expansion) {
      labelVideoControl(expansionButton, labels.collapse, 'collapse')
    }
    return expansionButton
  }
  const placeholder = () => {
    stopMedia()
    host.dataset.playback = 'idle'
    surface.textContent =
      source?.provider === 'youtube'
        ? 'YouTube'
        : source?.provider === 'vimeo'
          ? 'Vimeo'
          : labels.linked
    if (source?.provider === 'youtube') {
      showYouTubeThumbnail(surface, source.id!, labels.thumbnail)
    }
    message.textContent = source ? new URL(source.url).hostname : labels.error
    message.title = message.textContent
    actions.replaceChildren()
    if (options.interactive && source) {
      actions.append(button(labels.play, 'play', () => start(false)))
      if (options.expand) {
        actions.append(expansionControl())
      }
    }
  }
  const start = (silent: boolean) => {
    if (disposed || document.hidden || !source || !options.interactive) {
      return
    }
    autoplayPending = false
    observer?.disconnect()
    stopMedia()
    const current = generation
    const alive = () => !disposed && generation === current
    muted = silent
    requestedPlaying = true
    status('loading')
    surface.dataset.canvasUi = ''
    surface.classList.add('is-playing')
    const sound = button(muted ? labels.sound : labels.mute, muted ? 'sound' : 'mute', () => {
      muted = !muted
      if (media) {
        media.muted = muted
      }
      provider?.mute(muted)
      labelVideoControl(sound, muted ? labels.sound : labels.mute, muted ? 'sound' : 'mute')
    })
    const original = button(labels.open, 'open', () => {
      if (options.openOriginal) {
        options.openOriginal(source.url)
      } else {
        window.open(source.url, '_blank', 'noopener,noreferrer')
      }
    })
    playbackButton = button(labels.pause, 'pause', () => {
      requestedPlaying = !requestedPlaying
      if (requestedPlaying) {
        status('loading')
        if (media) {
          void media.play().catch((error: unknown) => {
            if (alive()) {
              status(playbackFailure(error))
            }
          })
        }
        provider?.play()
      } else {
        media?.pause()
        provider?.pause()
        status('paused')
      }
    })
    actions.replaceChildren(
      sound,
      playbackButton,
      button(labels.retry, 'retry', () => start(muted)),
      original
    )
    if (options.expand) {
      actions.append(expansionControl())
    }
    if (source.provider === 'youtube' && location.protocol === 'file:' && !options.embedOrigin) {
      status('blocked')
      showYouTubeThumbnail(surface, source.id!, labels.thumbnail)
      message.textContent = options.filePlaybackHint ?? labels.error
      actions.replaceChildren(original)
      if (options.expand) {
        actions.append(expansionControl())
      }
      return
    }
    timeout = setTimeout(() => {
      if (alive()) {
        status('blocked')
      }
    }, 15000)
    const update = (value: PlaybackStatus) => {
      if (alive()) {
        status(value)
      }
    }
    if (source.provider === 'direct') {
      const video = document.createElement('video')
      media = video
      video.controls = !expansion
      video.playsInline = true
      video.muted = muted
      video.preload = 'metadata'
      video.disablePictureInPicture = true
      video.setAttribute('aria-label', labels.linked)
      video.addEventListener('playing', () => update('playing'))
      video.addEventListener('pause', () => {
        if (video.error) {
          update('error')
        } else if (!['error', 'blocked'].includes(host.dataset.playback ?? '')) {
          update('paused')
        }
      })
      video.addEventListener('ended', () => update('paused'))
      video.addEventListener('error', () => update('error'))
      video.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') {
          event.stopPropagation()
        }
      })
      video.src = source.url
      surface.append(video)
      void video.play().catch((error: unknown) => update(playbackFailure(error)))
    } else {
      const iframe = document.createElement('iframe')
      iframe.title = source.provider === 'youtube' ? 'YouTube' : 'Vimeo'
      iframe.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture'
      iframe.referrerPolicy = 'strict-origin-when-cross-origin'
      const origin = /^https?:$/.test(location.protocol)
        ? location.origin
        : 'https://com.hwantage.canvaslide'
      surface.append(iframe)
      if (options.embedOrigin) {
        void options
          .embedOrigin()
          .then((bridgeOrigin) => {
            if (alive()) {
              provider = attachVideoEmbedBridge(iframe, bridgeOrigin, source, muted, update)
              if (!requestedPlaying) {
                provider.pause()
              }
            }
          })
          .catch(() => update('error'))
        return
      }
      iframe.src = videoEmbedUrl(source, muted, origin)
      void attachProviderPlayer(iframe, source, muted, alive, update)
        .then((player) => {
          if (alive()) {
            provider = player
            player?.mute(muted)
            if (!requestedPlaying) {
              player?.pause()
            }
          } else {
            player?.destroy()
          }
        })
        .catch(() => update('error'))
    }
  }
  const toggleExpandedPlayback = () => {
    if (expansion && media) {
      playbackButton?.click()
    } else if (expansion && host.dataset.playback === 'idle') {
      start(false)
    }
  }
  surface.addEventListener('click', toggleExpandedPlayback)
  surface.addEventListener('keydown', (event) => {
    if (expansion && event.target === surface && event.code === 'Space') {
      event.preventDefault()
      event.stopPropagation()
      toggleExpandedPlayback()
    }
  })
  const onPageHide = () => {
    expansion?.close()
    autoplayPending = false
    observer?.disconnect()
    placeholder()
  }
  const onHidden = () => {
    if (document.hidden) {
      onPageHide()
    }
  }
  document.addEventListener('visibilitychange', onHidden)
  window.addEventListener('pagehide', onPageHide)
  const onEscape = (event: KeyboardEvent) => {
    if (expansion && event.key === 'Escape') {
      event.preventDefault()
      event.stopImmediatePropagation()
      expansion.close()
    }
  }
  window.addEventListener('keydown', onEscape, true)
  placeholder()
  if (options.autoplay && !document.hidden) {
    observer = new IntersectionObserver(
      (entries) => {
        if (autoplayPending && entries.some((entry) => entry.intersectionRatio > 0.5)) {
          start(true)
        }
      },
      { threshold: [0.51] }
    )
    observer.observe(host)
  }
  return () => {
    disposed = true
    observer?.disconnect()
    document.removeEventListener('visibilitychange', onHidden)
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('keydown', onEscape, true)
    expansion?.dispose()
    stopMedia()
    host.replaceChildren()
  }
}
