import { readFileSync } from 'node:fs'
import { expect, test, type Frame, type Page } from '@playwright/test'

const embedOrigin = 'http://127.0.0.1:19998'
const embedHost = readFileSync('src-tauri/src/video_embed.rs', 'utf8')
const policy = (name: string) => new RegExp(`const ${name}: &str = "([^"]+)";`).exec(embedHost)![1]!
// Stand-in SDKs record calls; some ids select the failure a real player can report.
const fakeVimeo = `window.Vimeo = { Player: class {
  handlers = {}
  constructor(frame) {
    this.mode = new URL(frame.src).pathname.split('/').pop()
    window.sdkCalls = ['new ' + frame.src]
  }
  on(name, callback) { this.handlers[name] = callback }
  ready() { return this.mode === '4' ? Promise.reject(new Error('unavailable')) : Promise.resolve() }
  setMuted(value) { sdkCalls.push('muted ' + value); return Promise.resolve() }
  play() {
    sdkCalls.push('play')
    if (this.mode === '2') return Promise.reject(new DOMException('blocked', 'NotAllowedError'))
    if (this.mode === '3') return Promise.reject(new Error('failed'))
    this.handlers.play()
    if (this.mode === '5') this.handlers.ended()
    if (this.mode === '6') this.handlers.error()
    return Promise.resolve()
  }
  pause() { sdkCalls.push('pause'); this.handlers.pause(); return Promise.resolve() }
} }`
const fakeYouTube = `window.YT = { Player: class {
  constructor(node, options) {
    this.events = options.events
    this.mode = options.videoId
    window.sdkCalls = ['new ' + options.videoId + ' at ' + options.playerVars.start]
    setTimeout(() => this.events.onReady())
  }
  mute() { sdkCalls.push('muted true') }
  unMute() { sdkCalls.push('muted false') }
  playVideo() {
    sdkCalls.push('play')
    if (this.mode === 'blockedVid1') return this.events.onAutoplayBlocked()
    if (this.mode === 'brokenVid01') return this.events.onError()
    this.events.onStateChange({ data: 1 })
    if (this.mode === 'endedVideo1') this.events.onStateChange({ data: 0 })
  }
  pauseVideo() { sdkCalls.push('pause'); this.events.onStateChange({ data: 2 }) }
} }
window.onYouTubeIframeAPIReady()`
const providers = [
  {
    name: 'Vimeo',
    url: 'https://vimeo.com/76979871/abc123#t=12s',
    page: 'vimeo.html',
    csp: policy('VIMEO_CSP'),
    sdk: 'https://player.vimeo.com/api/player.js',
    fake: fakeVimeo,
    foreign: 'https://www.youtube.com/iframe_api',
    created:
      'new https://player.vimeo.com/video/76979871?autoplay=0&muted=0&playsinline=1&autopause=0&h=abc123#t=12s'
  },
  {
    name: 'YouTube',
    url: 'https://youtu.be/M7lc1UVf-VE?t=4',
    page: 'youtube.html',
    csp: policy('YOUTUBE_CSP'),
    sdk: 'https://www.youtube.com/iframe_api',
    fake: fakeYouTube,
    foreign: 'https://player.vimeo.com/api/player.js',
    created: 'new M7lc1UVf-VE at 4'
  }
]
type Provider = (typeof providers)[number]

/** Serves the shipped bridge page and script under the page policy the native host sends. */
async function routeEmbedHost(page: Page, provider: Provider) {
  await page.route(`${embedOrigin}/${provider.page}`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      headers: { 'Content-Security-Policy': provider.csp },
      body: readFileSync('src-tauri/src/video-embed.html', 'utf8')
    })
  )
  await page.route(`${embedOrigin}/video-embed.js`, (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: readFileSync('src-tauri/src/video-embed.js', 'utf8')
    })
  )
  await page.route('https://player.vimeo.com/video/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<p>Vimeo fixture</p>' })
  )
}

async function openDesktopEditor(page: Page) {
  await page.route('https://i.ytimg.com/**', (route) => route.fulfill({ status: 404, body: '' }))
  for (const endpoint of [
    'https://www.youtube.com/oembed?**',
    'https://vimeo.com/api/oembed.json?**'
  ]) {
    await page.route(endpoint, (route) => route.fulfill({ json: { width: 640, height: 360 } }))
  }
  await page.goto('/')
  await expect(page.getByTestId('canvas-viewport')).toBeVisible()
  // Install after startup so only video playback takes the desktop path.
  await page.evaluate((origin) => {
    Object.assign(window, {
      isTauri: true,
      __TAURI_INTERNALS__: {
        metadata: { currentWindow: { label: 'main' } },
        invoke: async (command: string) => (command === 'video_embed_origin' ? origin : null)
      }
    })
  }, embedOrigin)
}

async function paste(page: Page, text: string) {
  await page.evaluate((value) => {
    const data = new DataTransfer()
    data.setData('text/plain', value)
    document.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
    )
  }, text)
}

for (const provider of providers) {
  test(`${provider.name} plays inside the isolated desktop embed page, never in the main window @webkit`, async ({
    page
  }) => {
    await routeEmbedHost(page, provider)
    const sdkFrames: string[] = []
    await page.route(provider.sdk, (route) => {
      sdkFrames.push(route.request().frame().url())
      return route.fulfill({ contentType: 'text/javascript', body: provider.fake })
    })
    const foreignRequests: string[] = []
    await page.route(provider.foreign, (route) => {
      foreignRequests.push(route.request().url())
      return route.fulfill({ contentType: 'text/javascript', body: '' })
    })
    await openDesktopEditor(page)
    await paste(page, provider.url)
    const video = page.locator('[data-element-type="video"]')
    await video.getByRole('button', { name: 'Play video', exact: true }).click()
    await expect(video).toHaveAttribute('data-playback', 'playing')
    await video.getByRole('button', { name: 'Pause video', exact: true }).click()
    await expect(video).toHaveAttribute('data-playback', 'paused')
    await video.getByRole('button', { name: 'Mute', exact: true }).click()

    const embed = page.frames().find((frame) => frame.url().startsWith(`${embedOrigin}/`)) as Frame
    expect(embed.url()).toMatch(new RegExp(`^${embedOrigin}/${provider.page}#`))
    if (provider.name === 'Vimeo') {
      await expect(embed.locator('iframe')).toHaveAttribute(
        'allow',
        'autoplay; encrypted-media; fullscreen; picture-in-picture'
      )
    }
    await expect
      .poll(() => embed.evaluate(() => (window as unknown as { sdkCalls: string[] }).sdkCalls))
      .toEqual([provider.created, 'muted false', 'muted false', 'play', 'pause', 'muted true'])
    expect(sdkFrames).toEqual([embed.url()])
    expect(
      await page.evaluate(() => ({
        sdk: 'Vimeo' in window || 'YT' in window,
        scripts: [...document.scripts].filter(
          (script) => script.src && new URL(script.src).origin !== location.origin
        ).length
      }))
    ).toEqual({ sdk: false, scripts: 0 })
    const foreign = await embed.evaluate(
      (src) =>
        new Promise<string>((resolve) => {
          document.addEventListener('securitypolicyviolation', (event) =>
            resolve(`blocked ${event.blockedURI}`)
          )
          const script = document.createElement('script')
          script.onload = () => resolve('loaded')
          script.src = src
          document.head.append(script)
          setTimeout(() => resolve('no policy report'), 5000)
        }),
      provider.foreign
    )
    expect(foreign).toBe(`blocked ${provider.foreign}`)
    expect(foreignRequests).toEqual([])
  })
}

test('the embed pages report player failures and obey only their own parent @webkit', async ({
  page
}) => {
  const [vimeo, youtube] = providers as [Provider, Provider]
  await routeEmbedHost(page, vimeo)
  await routeEmbedHost(page, youtube)
  await page.route(youtube.sdk, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: youtube.fake })
  )
  const sdkFrames: string[] = []
  await page.route(vimeo.sdk, (route) => {
    const frame = route.request().frame().url()
    sdkFrames.push(new URLSearchParams(new URL(frame).hash.slice(1)).get('id')!)
    return frame.includes('id=7')
      ? route.abort()
      : route.fulfill({ contentType: 'text/javascript', body: vimeo.fake })
  })
  await page.goto('/')
  const parent = new URL(page.url()).origin
  // Frames named "auto-*" are played as soon as they report ready, as the app does.
  await page.evaluate(
    ({ origin, frames }) => {
      const statuses: Record<string, string[]> = {}
      Object.assign(window, { statuses })
      window.addEventListener('message', (event) => {
        const frame = [...document.querySelectorAll('iframe')].find(
          (node) => node.contentWindow === event.source
        )
        if (event.origin !== origin || !frame) {
          return
        }
        ;(statuses[frame.name] ??= []).push(event.data.status)
        if (event.data.status === 'ready' && frame.name.startsWith('auto-')) {
          frame.contentWindow!.postMessage({ channel: 'canvaslide-video', command: 'play' }, origin)
        }
      })
      for (const [name, path, hash] of frames) {
        const frame = document.createElement('iframe')
        frame.name = name!
        frame.src = `${origin}/${path}#${hash}`
        document.body.append(frame)
      }
    },
    {
      origin: embedOrigin,
      frames: [
        ['auto-blocked', 'vimeo.html', `id=2&start=0&muted=1&parent=${parent}`],
        ['auto-failed', 'vimeo.html', `id=3&start=0&muted=1&parent=${parent}`],
        ['auto-unready', 'vimeo.html', `id=4&start=0&muted=1&parent=${parent}`],
        ['auto-ended', 'vimeo.html', `id=5&start=0&muted=1&parent=${parent}`],
        ['auto-broken', 'vimeo.html', `id=6&start=0&muted=1&parent=${parent}`],
        ['auto-no-sdk', 'vimeo.html', `id=7&start=0&muted=1&parent=${parent}`],
        ['bad-id', 'vimeo.html', `id=12x&start=0&muted=1&parent=${parent}`],
        ['bad-hash', 'vimeo.html', `id=8&h=a-b&start=0&muted=1&parent=${parent}`],
        ['quiet', 'vimeo.html', `id=1&start=0&muted=1&parent=${parent}`],
        ['other-parent', 'vimeo.html', `id=9&start=0&muted=1&parent=http://127.0.0.1:1`],
        ['auto-long-id', 'vimeo.html', `id=12345678901&start=0&muted=1&parent=${parent}`],
        ['auto-yt-blocked', 'youtube.html', `id=blockedVid1&start=0&muted=1&parent=${parent}`],
        ['auto-yt-broken', 'youtube.html', `id=brokenVid01&start=0&muted=1&parent=${parent}`],
        ['auto-yt-ended', 'youtube.html', `id=endedVideo1&start=0&muted=1&parent=${parent}`],
        ['yt-bad-id', 'youtube.html', `id=76979871&start=0&muted=1&parent=${parent}`],
        ['outside', 'vimeo.html', `id=10&start=0&muted=1&parent=https://example.org`]
      ]
    }
  )
  const statuses = () =>
    page.evaluate(() => (window as unknown as { statuses: Record<string, string[]> }).statuses)
  await expect.poll(statuses).toEqual({
    'auto-blocked': ['ready', 'blocked'],
    'auto-failed': ['ready', 'error'],
    'auto-unready': ['error'],
    'auto-ended': ['ready', 'playing', 'paused'],
    'auto-broken': ['ready', 'playing', 'error'],
    'auto-no-sdk': ['error'],
    'bad-id': ['error'],
    'bad-hash': ['error'],
    'auto-long-id': ['ready', 'playing'],
    'auto-yt-blocked': ['ready', 'blocked'],
    'auto-yt-broken': ['ready', 'error'],
    'auto-yt-ended': ['ready', 'playing', 'paused'],
    'yt-bad-id': ['error'],
    quiet: ['ready']
  })
  const frame = (name: string) => page.frame({ name })!
  const calls = (name: string) =>
    frame(name).evaluate(() => (window as unknown as { sdkCalls?: string[] }).sdkCalls)
  await expect.poll(() => calls('other-parent')).toContain('muted true')
  // Untrusted commands are queued before the trusted pause, so its arrival proves they were seen.
  await frame('quiet').evaluate(() =>
    window.postMessage({ channel: 'canvaslide-video', command: 'play' }, '*')
  )
  await page.evaluate((origin) => {
    const target = (name: string) =>
      [...document.querySelectorAll('iframe')].find((node) => node.name === name)!.contentWindow!
    target('other-parent').postMessage({ channel: 'canvaslide-video', command: 'play' }, origin)
    target('quiet').postMessage({ channel: 'another', command: 'play' }, origin)
    // A same-origin window that is not the parent must not be obeyed either.
    const sibling = document.createElement('iframe')
    document.body.append(sibling)
    ;(sibling.contentWindow as unknown as { eval: (code: string) => void }).eval(
      `parent.frames.quiet.postMessage({ channel: 'canvaslide-video', command: 'play' }, '${origin}')`
    )
    target('quiet').postMessage({ channel: 'canvaslide-video', command: 'pause' }, origin)
  }, embedOrigin)
  await expect.poll(() => calls('quiet')).toContain('pause')
  expect(await calls('quiet')).not.toContain('play')
  expect(await calls('other-parent')).not.toContain('play')
  expect(sdkFrames).not.toContain('10')
  expect((await statuses()).quiet).toEqual(['ready', 'paused'])
})
