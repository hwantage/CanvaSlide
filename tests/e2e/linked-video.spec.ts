import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test, type Page, type Locator } from '@playwright/test'
import { unzipSync } from 'fflate'

const clip = readFileSync('tests/fixtures/linked-video.mp4')
const thumbnailFixture =
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="black"/><text x="32" y="180" fill="white">Video thumbnail fixture</text></svg>'
const url = 'http://127.0.0.1:19999/linked-video.mp4?signature=keep%2fme'
const video = (id: string, x: number) => ({
  id,
  type: 'video',
  url,
  autoplay: true,
  x,
  y: 30,
  width: 400,
  height: 270
})

test.beforeEach(async ({ page }) => {
  await page.route('https://i.ytimg.com/**', (route) => route.fulfill({ status: 404, body: '' }))
  for (const endpoint of [
    'https://www.youtube.com/oembed?**',
    'https://vimeo.com/api/oembed.json?**'
  ]) {
    await page.route(endpoint, (route) => route.fulfill({ json: { width: 640, height: 360 } }))
  }
})

async function clearClipboard(page: Page, browserName: string) {
  if (browserName === 'chromium') {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.evaluate(() => navigator.clipboard.writeText(''))
  }
}

test('YouTube shows a thumbnail before playback and falls back safely when it is unavailable @webkit', async ({
  page
}) => {
  await page.route('https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: thumbnailFixture
    })
  )
  await page.goto('/')
  await paste(page, 'https://youtu.be/M7lc1UVf-VE')
  const first = page.locator('[data-element-type="video"]').first()
  const thumbnail = first.getByRole('img', { name: 'YouTube video thumbnail' })
  await expect(thumbnail).toBeVisible()
  await expect(thumbnail).toHaveAttribute('src', /hqdefault\.jpg$/)
  await expect(first).toHaveAttribute('data-playback', 'idle')
  await expect(page.locator('video,iframe')).toHaveCount(0)
  await paste(page, 'https://youtu.be/aqz-KE-bpKQ')
  const unavailable = page.locator('[data-element-type="video"]').last()
  await expect(unavailable.locator('.linked-video-thumbnail')).toHaveCount(0)
  await expect(unavailable.getByText('YouTube', { exact: true })).toBeVisible()
  await expect(unavailable.getByRole('button', { name: 'Play video', exact: true })).toBeVisible()
})
const deck = () => ({
  version: 2,
  name: 'Linked video test',
  assets: {},
  settings: { transitionMs: 0 },
  elements: {
    f1: { id: 'f1', type: 'frame', name: 'First', order: 0, x: 0, y: 0, width: 960, height: 540 },
    f2: {
      id: 'f2',
      type: 'frame',
      name: 'Second',
      order: 1,
      x: 1200,
      y: 0,
      width: 960,
      height: 540
    },
    a: video('a', 30),
    b: video('b', 490),
    c: video('c', 1230),
    outside: video('outside', 2450)
  },
  order: ['f1', 'f2', 'a', 'b', 'c', 'outside']
})

async function openDeck(page: Page, content: unknown = deck()) {
  await page.context().route('http://127.0.0.1:19999/**', (route) =>
    route.fulfill({
      body: clip,
      contentType: 'video/mp4',
      headers: { 'Access-Control-Allow-Origin': '*' }
    })
  )
  await page.goto('/')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Open/ }).click()
  await (
    await chooser
  ).setFiles({
    name: 'videos.canvaslide',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(content))
  })
  await expect(page.locator('[data-element-type="video"]')).toHaveCount(4)
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

test('Command/Ctrl paste creates one video and preserves ordinary text, input paste and undo @webkit', async ({
  page,
  browserName
}) => {
  await page.goto('/')
  await clearClipboard(page, browserName)
  const primary = await page.evaluate(() =>
    /Mac|iPhone|iPad/.test(navigator.userAgent) ? 'Meta' : 'Control'
  )
  await page.keyboard.down(primary)
  await page.keyboard.press('v')
  await page.keyboard.up(primary)
  await paste(page, 'https://youtu.be/M7lc1UVf-VE?t=4')
  const videos = page.locator('[data-element-type="video"]')
  await expect(videos).toHaveCount(1)
  await page.waitForTimeout(350)
  await expect(videos).toHaveCount(1)
  await expect(page.locator('iframe, video')).toHaveCount(0)
  await page.keyboard.press(`${primary}+z`)
  await expect(videos).toHaveCount(0)
  await page.keyboard.press(`${primary}+Shift+z`)
  await expect(videos).toHaveCount(1)
  await paste(page, 'https://example.org/article')
  await expect(page.locator('[data-element-type="text"]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Insert video link', exact: true }).click()
  const input = page.getByRole('textbox', { name: 'Video URL' })
  await input.fill('https://cdn.example/extensionless?token=123')
  await input.focus()
  await input.press('ArrowLeft')
  await expect(videos).toHaveCount(1)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Insert video link', exact: true })
    .click()
  await expect(videos).toHaveCount(2)
  await page.keyboard.press(`${primary}+z`)
  await expect(videos).toHaveCount(1)
})

test('Windows Ctrl+V uses the URL path @webkit', async ({ page, browserName }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'userAgent', {
      get: () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    })
  )
  await page.goto('/')
  await clearClipboard(page, browserName)
  await page.keyboard.press('Control+v')
  await paste(page, 'https://vimeo.com/76979871')
  await expect(page.locator('[data-element-type="video"]')).toHaveCount(1)
  await page.waitForTimeout(350)
  await expect(page.locator('[data-element-type="video"]')).toHaveCount(1)
  await page.keyboard.press('Control+z')
  await expect(page.locator('[data-element-type="video"]')).toHaveCount(0)
})

test('autoplay is an undoable video property and unchecked videos stay manual in a slide @webkit', async ({
  page
}) => {
  await openDeck(page)
  const a = page.locator('[data-element-id="a"]')
  const bounds = await a.boundingBox()
  await page.mouse.click(bounds!.x + 20, bounds!.y + 20)
  const checkbox = page.getByRole('checkbox', { name: 'Autoplay in Slide Show' })
  await expect(checkbox).toBeChecked()
  await checkbox.uncheck()
  await page.getByRole('button', { name: /^Undo/ }).click()
  await expect(checkbox).toBeChecked()
  await page.getByRole('button', { name: /^Redo/ }).click()
  await expect(checkbox).not.toBeChecked()
  await page.screenshot({ path: 'discuss/linked-video-properties.png' })
  await page.getByRole('button', { name: /^Slide Show/ }).click()
  await expect(a).toHaveAttribute('data-playback', 'idle')
  await expect(page.locator('video')).toHaveCount(1)
  const play = a.getByRole('button', { name: 'Play video', exact: true })
  await expect(play.locator('svg')).toHaveCount(1)
  await play.click()
  await expect(a).toHaveAttribute('data-playback', 'playing')
  const controls = a.locator('.linked-video-actions')
  await expect(controls.locator('button svg')).toHaveCount(5)
  const right = await controls.boundingBox()
  const outer = await a.boundingBox()
  expect(outer!.x + outer!.width - right!.x - right!.width).toBeLessThan(25)
  await page.screenshot({ path: 'discuss/linked-video-controls.png' })
  await page.keyboard.press('Escape')
  await expect(page.locator('video')).toHaveCount(0)
})

test('paste sizes a portrait direct video from metadata, without playing or adding an undo step @webkit', async ({
  page
}) => {
  await page.route('https://media.example/portrait.mp4', (route) =>
    route.fulfill({
      contentType: 'video/mp4',
      body: readFileSync('tests/fixtures/linked-video-portrait.mp4')
    })
  )
  await page.goto('/')
  await paste(page, 'https://media.example/portrait.mp4')
  const video = page.locator('[data-element-type="video"]')
  await expect
    .poll(async () => {
      const box = await video.locator('.linked-video-surface').boundingBox()
      return box ? box.width / box.height : 0
    })
    .toBeCloseTo(9 / 16, 2)
  await expect(page.locator('video')).toHaveCount(0)
  await page.screenshot({ path: 'discuss/linked-video-portrait.png' })
  const fitted = await video.getAttribute('style')
  await page.getByRole('button', { name: /^Undo/ }).click()
  await expect(video).toHaveCount(0)
  await page.getByRole('button', { name: /^Redo/ }).click()
  await expect(video).toHaveAttribute('style', fitted!)
  await video.getByRole('button', { name: 'Play video', exact: true }).click()
  await expect(video).toHaveAttribute('data-playback', 'playing')
  await video.getByRole('button', { name: 'Pause video', exact: true }).click()
  await expandVideo(page, video, page.getByTestId('canvas-viewport'))
  expect(
    await video
      .locator('video')
      .evaluate((node: HTMLVideoElement) => node.videoWidth / node.videoHeight)
  ).toBeCloseTo(9 / 16, 2)
  await page.screenshot({ path: 'discuss/linked-video-expanded-portrait.png' })
  await page.keyboard.press('Escape')
  await expect(video).toHaveAttribute('style', fitted!)
})

test('provider metadata selects portrait placement and Shorts retain a portrait fallback @webkit', async ({
  page
}) => {
  await page.route('https://vimeo.com/api/oembed.json?**', (route) =>
    route.fulfill({ json: { width: 1080, height: 1920 } })
  )
  await page.goto('/')
  await paste(page, 'https://vimeo.com/123456789')
  const first = page.locator('[data-element-type="video"]').first()
  await expect
    .poll(async () => {
      const box = await first.locator('.linked-video-surface').boundingBox()
      return box ? box.width / box.height : 0
    })
    .toBeCloseTo(9 / 16, 2)
  await paste(page, 'https://youtube.com/shorts/M7lc1UVf-VE')
  const short = page.locator('[data-element-type="video"]').last()
  await expect
    .poll(async () => {
      const box = await short.locator('.linked-video-surface').boundingBox()
      return box ? box.width / box.height : 0
    })
    .toBeCloseTo(9 / 16, 2)
  await expect(page.locator('video,iframe')).toHaveCount(0)
})

test('manual controls preserve placement; presentation starts only current clips and tears down on navigation @webkit', async ({
  page
}) => {
  await openDeck(page)
  const a = page.locator('[data-element-id="a"]')
  const original = await a.getAttribute('style')
  await a.getByRole('button', { name: 'Play video', exact: true }).click()
  await expect(a).toHaveAttribute('data-playback', 'playing')
  expect(await a.getAttribute('style')).toBe(original)
  await a.getByRole('button', { name: 'Pause video', exact: true }).click()
  await expect(a).toHaveAttribute('data-playback', 'paused')
  await expect(page.locator('video')).toHaveCount(1)
  await page.getByRole('button', { name: /^Slide Show/ }).click()
  await expect(page.locator('video')).toHaveCount(2)
  await expect(page.locator('[data-element-id="a"]')).toHaveAttribute('data-playback', 'playing')
  expect(
    await page
      .locator('video')
      .evaluateAll((nodes) =>
        nodes.every((node) => node instanceof HTMLVideoElement && node.muted && !node.paused)
      )
  ).toBe(true)
  await page.evaluate(() => {
    ;(window as unknown as { previousVideos: HTMLVideoElement[] }).previousVideos = [
      ...document.querySelectorAll('video')
    ]
  })
  await page.getByRole('button', { name: /^Next frame/ }).click()
  await expect(page.locator('video')).toHaveCount(1)
  await expect(page.locator('[data-element-id="c"]')).toHaveAttribute('data-playback', 'playing')
  expect(
    await page.evaluate(() =>
      (window as unknown as { previousVideos: HTMLVideoElement[] }).previousVideos.every(
        (node) => node.paused && !node.isConnected && !node.getAttribute('src')
      )
    )
  ).toBe(true)
  await page.getByRole('button', { name: /^Overview/ }).click()
  await expect(page.locator('video, iframe')).toHaveCount(0)
  await page.getByRole('button', { name: /^Overview/ }).click()
  await expect(page.locator('video')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(page.locator('video, iframe')).toHaveCount(0)
  await page.screenshot({ path: 'discuss/linked-video-editor.png' })
})

async function pauseAndResume(host: Locator) {
  const media = await host.locator('video').elementHandle()
  await expect
    .poll(() => media!.evaluate((node: HTMLVideoElement) => node.currentTime))
    .toBeGreaterThan(0.2)
  await host.getByRole('button', { name: 'Pause video', exact: true }).click()
  await expect(host).toHaveAttribute('data-playback', 'paused')
  const pausedAt = await media!.evaluate((node: HTMLVideoElement) => node.currentTime)
  await new Promise((resolve) => setTimeout(resolve, 250))
  expect(await media!.evaluate((node: HTMLVideoElement) => node.currentTime)).toBeCloseTo(
    pausedAt,
    2
  )
  await host.getByRole('button', { name: 'Resume video', exact: true }).click()
  await expect(host).toHaveAttribute('data-playback', 'playing')
  await expect
    .poll(() => media!.evaluate((node: HTMLVideoElement) => node.currentTime))
    .toBeGreaterThan(pausedAt + 0.15)
  expect(await media!.evaluate((node) => node.isConnected)).toBe(true)
}

async function expectExpanded(host: Locator, viewport: Locator) {
  await expect(host).toHaveAttribute('data-expanded', 'true')
  await expect(host.locator('.linked-video-footer')).toBeHidden()
  await expect(host.locator('video')).not.toHaveAttribute('controls', '')
  expect((await host.locator('.linked-video-return').boundingBox())!.height).toBeLessThan(40)
  await expect
    .poll(async () => {
      const outer = (await host.boundingBox())!
      const area = (await viewport.boundingBox())!
      return Math.max(
        Math.abs(outer.x - area.x),
        Math.abs(outer.y - area.y),
        Math.abs(outer.width - area.width),
        Math.abs(outer.height - area.height)
      )
    })
    .toBeLessThan(1)
}

async function expandVideo(page: Page, host: Locator, viewport: Locator) {
  const media = await host.locator('video').elementHandle()
  const geometry = (node: HTMLElement) => [
    node.style.left,
    node.style.top,
    node.style.width,
    node.style.height
  ]
  const original = await host.evaluate(geometry)
  await host.getByRole('button', { name: 'Expand video', exact: true }).click()
  await expectExpanded(host, viewport)
  expect(await host.evaluate(geometry)).toEqual(original)
  expect(await media!.evaluate((node) => node.isConnected)).toBe(true)
  await expect(host.locator('video')).toHaveCSS('object-fit', 'contain')
  await page.screenshot({ path: 'discuss/linked-video-expanded.png' })
}

test('pause/resume and expand/return preserve the current video, timestamp and document geometry @webkit', async ({
  page
}) => {
  await openDeck(page)
  const a = page.locator('[data-element-id="a"]')
  const before = (await a.boundingBox())!
  await a.getByRole('button', { name: 'Play video', exact: true }).click()
  await pauseAndResume(a)
  await a.getByRole('button', { name: 'Pause video', exact: true }).click()
  const pausedAt = await a.locator('video').evaluate((node: HTMLVideoElement) => node.currentTime)
  await expandVideo(page, a, page.getByTestId('canvas-viewport'))
  await expect(a).toHaveAttribute('data-playback', 'paused')
  expect(
    await a.locator('video').evaluate((node: HTMLVideoElement) => node.currentTime)
  ).toBeCloseTo(pausedAt, 2)
  await page.keyboard.press('Space')
  await expect(a).toHaveAttribute('data-playback', 'playing')
  await a.locator('video').click()
  await expect(a).toHaveAttribute('data-playback', 'paused')
  await a.getByRole('button', { name: 'Return to previous view', exact: true }).click()
  expect((await a.boundingBox())!.width).toBeCloseTo(before.width, 1)
  await expect(a.locator('.linked-video-footer')).toBeVisible()
  await expect(a.locator('video')).toHaveAttribute('controls', '')
  await expandVideo(page, a, page.getByTestId('canvas-viewport'))
  await page.keyboard.press('Escape')
  await expect(a).not.toHaveAttribute('data-expanded', 'true')
  expect((await a.boundingBox())!.width).toBeCloseTo(before.width, 1)
  await expect(a.locator('.linked-video-footer')).toBeVisible()
  await expect(a.locator('video')).toHaveAttribute('controls', '')
  await page.getByRole('button', { name: /^Slide Show/ }).click()
  await expect(a).toHaveAttribute('data-playback', 'playing')
  await expandVideo(page, a, page.getByTestId('canvas-viewport'))
  await page.setViewportSize({ width: 1100, height: 740 })
  await expectExpanded(a, page.getByTestId('canvas-viewport'))
  await page.keyboard.press('Escape')
  await expect(a).not.toHaveAttribute('data-expanded', 'true')
  await expect(page.getByRole('button', { name: /^Next frame/ })).toBeVisible()
  await expandVideo(page, a, page.getByTestId('canvas-viewport'))
  const old = await a.locator('video').elementHandle()
  await page.getByRole('button', { name: /^Next frame/ }).click()
  await expect(page.locator('[data-element-id="c"]')).toHaveAttribute('data-playback', 'playing')
  expect(
    await old!.evaluate(
      (node: HTMLVideoElement) => node.paused && !node.isConnected && !node.getAttribute('src')
    )
  ).toBe(true)
})

test('autoplay rejection leaves manual playback and retry available @webkit', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = () =>
      Promise.reject(new DOMException('Denied', 'NotAllowedError'))
  })
  await openDeck(page)
  await page.getByRole('button', { name: /^Slide Show/ }).click()
  await expect(page.locator('[data-element-id="a"]')).toHaveAttribute('data-playback', 'blocked')
  await expect(page.locator('[data-element-id="a"] video')).toHaveAttribute('controls', '')
  await expect(
    page.locator('[data-element-id="a"]').getByRole('button', { name: 'Retry', exact: true })
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('video')).toHaveCount(0)
})

test('WebM decodes and an unavailable direct URL exposes retry and the original link @webkit', async ({
  page
}) => {
  await page.route('https://media.example/**', (route) =>
    route.request().url().endsWith('.webm')
      ? route.fulfill({
          contentType: 'video/webm',
          body: readFileSync('tests/fixtures/linked-video.webm')
        })
      : route.fulfill({ status: 404, body: 'Missing' })
  )
  await page.goto('/')
  await paste(page, 'https://media.example/clip.webm')
  const videos = page.locator('[data-element-type="video"]')
  await videos.first().getByRole('button', { name: 'Play video', exact: true }).click()
  await expect(videos.first()).toHaveAttribute('data-playback', 'playing')
  expect(
    await videos
      .first()
      .locator('video')
      .evaluate((node) => (node as HTMLVideoElement).videoWidth)
  ).toBe(320)
  await videos.first().getByRole('button', { name: 'Pause video', exact: true }).click()
  await paste(page, 'https://media.example/missing.mp4')
  await videos.last().getByRole('button', { name: 'Play video', exact: true }).click()
  await expect(videos.last()).toHaveAttribute('data-playback', 'error')
  await expect(videos.last().getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
  await expect(
    videos.last().getByRole('button', { name: 'Open original', exact: true })
  ).toBeVisible()
})

test('save/open and standalone HTML preserve URLs without video bytes; exported overview stops playback @webkit', async ({
  page
}) => {
  const content = deck()
  content.elements.b.autoplay = false
  content.elements.b.url = 'https://youtu.be/M7lc1UVf-VE'
  await page.context().route('https://i.ytimg.com/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: thumbnailFixture
    })
  )
  await openDeck(page, content)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /^Save \(/ }).click()
  const dir = mkdtempSync(join(tmpdir(), 'canvaslide-video-'))
  const saved = join(dir, 'saved.canvaslide')
  await (await download).saveAs(saved)
  const savedBytes = readFileSync(saved)
  const entries = savedBytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))
    ? unzipSync(savedBytes)
    : { 'document.json': savedBytes }
  expect(Object.keys(entries)).toEqual(['document.json'])
  const document = JSON.parse(Buffer.from(entries['document.json']!).toString('utf8'))
  expect(document.elements.a.url).toBe(url)
  expect(document.elements.b.autoplay).toBe(false)
  expect(document.assets).toEqual({})
  expect(savedBytes.length).toBeLessThan(4000)
  const reopen = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Open/ }).click()
  await (await reopen).setFiles(saved)
  await expect(page.locator('[data-element-type="video"]')).toHaveCount(4)
  await expect(page.locator('video, iframe')).toHaveCount(0)
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  await page.getByRole('button', { name: 'Export HTML', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Export presentation' })
  await expect(dialog.getByTestId('export-size')).not.toContainText('calculating')
  const htmlDownload = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export…' }).click()
  const htmlFile = join(dir, 'videos.html')
  await (await htmlDownload).saveAs(htmlFile)
  const player = await page.context().newPage()
  await player.goto(pathToFileURL(htmlFile).href)
  await expect(player.locator('video')).toHaveCount(1)
  await expect(player.locator('[data-video-id="b"]')).toHaveAttribute('data-playback', 'idle')
  await expect(player.locator('[data-video-id="b"] img')).toBeVisible()
  await player
    .locator('[data-video-id="b"]')
    .getByRole('button', { name: 'Play video', exact: true })
    .click()
  await expect(player.locator('[data-video-id="b"]')).toHaveAttribute('data-playback', 'blocked')
  await expect(player.locator('[data-video-id="b"] img')).toBeVisible()
  await expect(player.locator('[data-video-id="b"]')).toContainText('HTTP(S)')
  await expect(player.locator('[data-video-id="a"]')).toHaveAttribute('data-playback', 'playing')
  const exportedVideo = player.locator('[data-video-id="a"]')
  await pauseAndResume(exportedVideo)
  await expandVideo(player, exportedVideo, player.getByTestId('canvas-viewport'))
  await player.keyboard.press('Escape')
  await expect(exportedVideo).not.toHaveAttribute('data-expanded', 'true')
  await expandVideo(player, exportedVideo, player.getByTestId('canvas-viewport'))
  await player.getByRole('button', { name: 'Next frame (→)' }).click()
  await expect(player.locator('video')).toHaveCount(1)
  await expect(player.locator('[data-video-id="c"]')).toHaveAttribute('data-playback', 'playing')
  await player.getByRole('button', { name: 'Overview (O)' }).click()
  await expect(player.locator('video, iframe')).toHaveCount(0)
  await player.close()
})

test('leaving a slide before the provider SDK loads cannot revive hidden playback @webkit', async ({
  page
}) => {
  const content = deck()
  content.elements.a.url = 'https://youtu.be/M7lc1UVf-VE'
  content.elements.b.url = 'https://youtu.be/aqz-KE-bpKQ'
  await page.route('https://www.youtube.com/embed/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html><body>Provider fixture</body></html>' })
  )
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('https://www.youtube.com/iframe_api', async (route) => {
    await gate
    await route.fulfill({
      contentType: 'text/javascript',
      body: `window.YT = { Player: function() { document.documentElement.dataset.providerConstructed = 'yes'; } }; window.onYouTubeIframeAPIReady();`
    })
  })
  await openDeck(page, content)
  const requested = page.waitForRequest('https://www.youtube.com/iframe_api')
  await page.getByRole('button', { name: /^Slide Show/ }).click()
  await requested
  await expect(page.locator('iframe')).toHaveCount(1)
  await expect(
    page.locator('[data-element-id="b"]').getByRole('button', { name: 'Play video', exact: true })
  ).toBeVisible()
  await page.getByRole('button', { name: /^Next frame/ }).click()
  await expect(page.locator('iframe')).toHaveCount(0)
  release()
  await page.waitForTimeout(250)
  await expect(page.locator('html')).not.toHaveAttribute('data-provider-constructed', 'yes')
  await expect(page.locator('iframe')).toHaveCount(0)
})

test('deleting and undoing a manually playing video never restores hidden playback @webkit', async ({
  page
}) => {
  await openDeck(page)
  const a = page.locator('[data-element-id="a"]')
  const bounds = await a.boundingBox()
  await page.mouse.click(bounds!.x + 20, bounds!.y + 20)
  await a.getByRole('button', { name: 'Play video', exact: true }).click()
  await expect(a).toHaveAttribute('data-playback', 'playing')
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(a).toHaveCount(0)
  await expect(page.locator('video')).toHaveCount(0)
  await page.getByRole('button', { name: /^Undo/ }).click()
  await expect(a).toHaveAttribute('data-playback', 'idle')
  await expect(page.locator('video')).toHaveCount(0)
})
