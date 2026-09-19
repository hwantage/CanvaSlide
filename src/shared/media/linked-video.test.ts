import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mountLinkedVideo, type VideoLabels } from './linked-video'
import { attachProviderPlayer, type ProviderPlayer } from './provider-player'
import { attachYouTubeBridge } from './youtube-bridge'

vi.mock('./provider-player', () => ({ attachProviderPlayer: vi.fn() }))
const labels: VideoLabels = {
  play: 'Play',
  pause: 'Pause',
  resume: 'Resume',
  expand: 'Expand',
  collapse: 'Return',
  sound: 'Sound',
  mute: 'Mute',
  loading: 'Loading',
  blocked: 'Blocked',
  error: 'Error',
  retry: 'Retry',
  open: 'Open',
  thumbnail: 'Thumbnail',
  linked: 'Video'
}
beforeEach(() => {
  vi.spyOn(HTMLIFrameElement.prototype, 'src', 'set').mockImplementation(() => undefined)
  vi.spyOn(HTMLImageElement.prototype, 'src', 'set').mockImplementation(() => undefined)
})
afterEach(() => {
  document.body.replaceChildren()
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('does not start queued autoplay after the page was hidden, even when visible again', () => {
  let notify!: IntersectionObserverCallback
  const disconnect = vi.fn()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        notify = callback
      }
      observe = vi.fn()
      disconnect = disconnect
    }
  )
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  const host = document.createElement('div')
  document.body.append(host)
  const cleanup = mountLinkedVideo(host, {
    url: 'https://youtu.be/M7lc1UVf-VE',
    labels,
    interactive: true,
    autoplay: true
  })
  hidden.mockReturnValue(true)
  document.dispatchEvent(new Event('visibilitychange'))
  expect(disconnect).toHaveBeenCalledOnce()
  hidden.mockReturnValue(false)
  notify([{ intersectionRatio: 1 } as IntersectionObserverEntry], {} as IntersectionObserver)
  expect(host.dataset.playback).toBe('idle')
  expect(host.querySelector('iframe')).toBeNull()
  expect(attachProviderPlayer).not.toHaveBeenCalled()
  cleanup()
})

it('destroys a late SDK result after its slide has left and rejects late playback callbacks', async () => {
  let resolve!: (value: ProviderPlayer) => void
  vi.mocked(attachProviderPlayer).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    })
  )
  const host = document.createElement('div')
  document.body.append(host)
  const cleanup = mountLinkedVideo(host, {
    url: 'https://youtu.be/M7lc1UVf-VE',
    labels,
    interactive: true,
    autoplay: false
  })
  host.querySelector('button')!.click()
  expect(host.querySelector('iframe')).not.toBeNull()
  const alive = vi.mocked(attachProviderPlayer).mock.calls[0]![3]
  expect(alive()).toBe(true)
  cleanup()
  expect(alive()).toBe(false)
  const destroy = vi.fn()
  resolve({ mute: vi.fn(), play: vi.fn(), pause: vi.fn(), destroy })
  await vi.waitFor(() => expect(destroy).toHaveBeenCalledOnce())
  expect(host.querySelector('iframe')).toBeNull()
})

it('accepts bridge messages only from the exact iframe and loopback origin, and removes listeners', () => {
  const frame = document.createElement('iframe')
  document.body.append(frame)
  const status = vi.fn()
  const bridge = attachYouTubeBridge(
    frame,
    'http://127.0.0.1:1234',
    { provider: 'youtube', url: 'https://youtu.be/M7lc1UVf-VE', id: 'M7lc1UVf-VE', start: 0 },
    true,
    status
  )
  const send = (origin: string, source: MessageEventSource | null, value = 'playing') =>
    window.dispatchEvent(
      new MessageEvent('message', {
        origin,
        source,
        data: { channel: 'canvaslide-video', status: value }
      })
    )
  send('https://evil.example', frame.contentWindow)
  send('http://127.0.0.1:1234', window)
  send('http://127.0.0.1:1234', frame.contentWindow, 'unexpected')
  expect(status).not.toHaveBeenCalled()
  send('http://127.0.0.1:1234', frame.contentWindow)
  expect(status).toHaveBeenCalledExactlyOnceWith('playing')
  const source = frame.contentWindow
  bridge.destroy()
  send('http://127.0.0.1:1234', source)
  expect(status).toHaveBeenCalledOnce()
})

it('keeps the same iframe while pausing before the SDK arrives and resuming afterwards', async () => {
  let resolve!: (player: ProviderPlayer) => void
  vi.mocked(attachProviderPlayer).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    })
  )
  const host = document.createElement('div')
  document.body.append(host)
  const cleanup = mountLinkedVideo(host, {
    url: 'https://youtu.be/M7lc1UVf-VE',
    labels,
    interactive: true,
    autoplay: false
  })
  host.querySelector<HTMLButtonElement>('[aria-label="Play"]')!.click()
  const frame = host.querySelector('iframe')
  host.querySelector<HTMLButtonElement>('[aria-label="Pause"]')!.click()
  const player = { mute: vi.fn(), play: vi.fn(), pause: vi.fn(), destroy: vi.fn() }
  resolve(player)
  await vi.waitFor(() => expect(player.pause).toHaveBeenCalledOnce())
  host.querySelector<HTMLButtonElement>('[aria-label="Resume"]')!.click()
  expect(player.play).toHaveBeenCalledOnce()
  expect(host.querySelector('iframe')).toBe(frame)
  expect(player.destroy).not.toHaveBeenCalled()
  cleanup()
  expect(player.destroy).toHaveBeenCalledOnce()
})

it('replays the latest mute and pause intent only after the authenticated native bridge is ready', () => {
  const frame = document.createElement('iframe')
  document.body.append(frame)
  const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => undefined)
  const bridge = attachYouTubeBridge(
    frame,
    'http://127.0.0.1:1234',
    { provider: 'youtube', url: 'https://youtu.be/M7lc1UVf-VE', id: 'M7lc1UVf-VE', start: 0 },
    true,
    vi.fn()
  )
  bridge.pause()
  bridge.mute(false)
  expect(post).not.toHaveBeenCalled()
  window.dispatchEvent(
    new MessageEvent('message', {
      origin: 'http://127.0.0.1:1234',
      source: frame.contentWindow,
      data: { channel: 'canvaslide-video', status: 'ready' }
    })
  )
  expect(post.mock.calls.map(([message]) => message.command)).toEqual(['unmute', 'pause'])
  bridge.play()
  expect(post).toHaveBeenLastCalledWith(
    { channel: 'canvaslide-video', command: 'play' },
    'http://127.0.0.1:1234'
  )
  bridge.destroy()
})
