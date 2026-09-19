import { afterEach, expect, it, vi } from 'vitest'
import { parseVideoSource } from '@shared/canvas/video-source'
import { readVideoAspectRatio } from './video-metadata'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('reads provider dimensions without trusting embedded HTML or including credentials', async () => {
  const fetcher = vi.fn(async () => ({
    ok: true,
    json: async () => ({ width: 1080, height: 1920, html: '<script>bad()</script>' })
  }))
  vi.stubGlobal('fetch', fetcher)
  const controller = new AbortController()
  expect(
    await readVideoAspectRatio(parseVideoSource('https://vimeo.com/123456/abc')!, controller.signal)
  ).toBe(9 / 16)
  const [url, options] = fetcher.mock.calls[0] as unknown as [URL, RequestInit]
  expect(url.origin + url.pathname).toBe('https://vimeo.com/api/oembed.json')
  expect(url.searchParams.get('url')).toBe('https://vimeo.com/123456/abc')
  expect(options.credentials).toBe('omit')
  expect(document.querySelector('script')).toBeNull()
})

it('reads direct metadata without playing and releases the media URL', async () => {
  const create = document.createElement.bind(document)
  const video = create('video')
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
    tag === 'video' ? video : create(tag)) as typeof document.createElement)
  const play = vi.spyOn(video, 'play')
  vi.spyOn(video, 'load').mockImplementation(() => undefined)
  Object.defineProperties(video, { videoWidth: { value: 180 }, videoHeight: { value: 320 } })
  const controller = new AbortController()
  const result = readVideoAspectRatio(
    parseVideoSource('https://example.org/v.mp4')!,
    controller.signal
  )
  video.dispatchEvent(new Event('loadedmetadata'))
  expect(await result).toBe(9 / 16)
  expect(play).not.toHaveBeenCalled()
  expect(video.getAttribute('src')).toBeNull()
  expect(video.isConnected).toBe(false)
})

it('cleans up a direct metadata request on cancellation', async () => {
  const create = document.createElement.bind(document)
  const video = create('video')
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
    tag === 'video' ? video : create(tag)) as typeof document.createElement)
  vi.spyOn(video, 'load').mockImplementation(() => undefined)
  const controller = new AbortController()
  const result = readVideoAspectRatio(
    parseVideoSource('https://example.org/v.mp4')!,
    controller.signal
  )
  controller.abort()
  expect(await result).toBeNull()
  expect(video.getAttribute('src')).toBeNull()
})

it('falls back when a provider refuses metadata or returns invalid dimensions', async () => {
  const source = parseVideoSource('https://youtu.be/M7lc1UVf-VE')!
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ width: '100', height: 0 }) }))
  )
  expect(await readVideoAspectRatio(source, new AbortController().signal)).toBeNull()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
  )
  expect(await readVideoAspectRatio(source, new AbortController().signal)).toBeNull()
})
