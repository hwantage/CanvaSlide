import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const headersFile = readFileSync('src/renderer/public/_headers', 'utf8')
const policy = headersFile.match(/^\s+Content-Security-Policy: (.+)$/m)![1]!

test.beforeEach(async ({ page }) => {
  await page.route('**/share-policy-test', (route) =>
    route.fulfill({
      contentType: 'text/html',
      headers: { 'Content-Security-Policy': policy },
      body: '<!doctype html><html><head><title>Share policy</title></head><body></body></html>'
    })
  )
  await page.goto('/share-policy-test')
})

test('Pages policy blocks arbitrary remote resources and inline scripts @webkit', async ({
  page
}) => {
  const requests: string[] = []
  await page.route('https://tracker.invalid/**', async (route) => {
    requests.push(route.request().url())
    await route.fulfill({ body: '' })
  })
  await page.evaluate(() => {
    const violations: string[] = []
    document.addEventListener('securitypolicyviolation', (event) => {
      violations.push(event.effectiveDirective)
      document.body.dataset.violations = JSON.stringify(violations)
    })
    const image = new Image()
    image.src = 'https://tracker.invalid/pixel'
    const script = document.createElement('script')
    script.src = 'https://tracker.invalid/script.js'
    const inline = document.createElement('script')
    inline.textContent = 'document.body.dataset.inlineExecuted = "yes"'
    const frame = document.createElement('iframe')
    frame.src = 'https://tracker.invalid/frame'
    const video = document.createElement('video')
    video.preload = 'auto'
    video.src = 'https://tracker.invalid/clip.mp4'
    const style = document.createElement('link')
    style.rel = 'stylesheet'
    style.href = 'https://tracker.invalid/style.css'
    document.body.append(image, script, inline, frame, video, style)
    void fetch('https://tracker.invalid/connect').catch(() => {})
  })
  await expect
    .poll(async () => {
      const violations = await page.locator('body').getAttribute('data-violations')
      return new Set<string>(JSON.parse(violations ?? '[]')).size
    })
    .toBe(6)
  const violations: string[] = JSON.parse(
    (await page.locator('body').getAttribute('data-violations'))!
  )
  expect(violations).toEqual(
    expect.arrayContaining(['img-src', 'frame-src', 'media-src', 'connect-src'])
  )
  expect(violations.filter((name) => name.startsWith('script-src'))).toHaveLength(2)
  await expect(page.locator('body')).not.toHaveAttribute('data-inline-executed', 'yes')
  expect(requests).toEqual([])
})

test('Pages policy permits provider SDKs, frames, thumbnails and same-origin media @webkit', async ({
  page
}) => {
  const scripts = [
    'https://www.youtube.com/iframe_api',
    'https://s.ytimg.com/yts/jsbin/www-widgetapi.js',
    'https://player.vimeo.com/api/player.js'
  ]
  for (const url of scripts) {
    await page.route(url, (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: 'document.body.dataset.sdkCount = String(Number(document.body.dataset.sdkCount || 0) + 1)'
      })
    )
  }
  const frames = [
    'https://www.youtube.com/embed/M7lc1UVf-VE',
    'https://player.vimeo.com/video/76979871'
  ]
  const loadedFrames: string[] = []
  for (const url of frames) {
    await page.route(url, async (route) => {
      loadedFrames.push(route.request().url())
      await route.fulfill({
        contentType: 'text/html',
        body: '<html><body>Provider fixture</body></html>'
      })
    })
  }
  await page.route('https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'
    })
  )
  await page.route('**/allowed-clip.mp4', (route) =>
    route.fulfill({
      contentType: 'video/mp4',
      body: readFileSync('tests/fixtures/linked-video.mp4')
    })
  )
  await page.route('**/api/share/policy', (route) => route.fulfill({ json: { ok: true } }))
  await page.evaluate(
    async ({ scripts, frames }) => {
      document.addEventListener('securitypolicyviolation', () => {
        document.body.dataset.blocked = 'yes'
      })
      for (const url of scripts) {
        const script = document.createElement('script')
        script.src = url
        document.head.append(script)
      }
      for (const url of frames) {
        const frame = document.createElement('iframe')
        frame.src = url
        document.body.append(frame)
      }
      const image = new Image()
      image.src = 'https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg'
      image.onload = () => {
        document.body.dataset.thumbnail = 'loaded'
      }
      const video = document.createElement('video')
      video.preload = 'auto'
      video.src = '/allowed-clip.mp4'
      video.onloadeddata = () => {
        document.body.dataset.media = 'loaded'
      }
      document.body.append(image, video)
      const response = await fetch('/api/share/policy')
      document.body.dataset.api = String((await response.json()).ok)
      await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]))
    },
    { scripts, frames }
  )
  await expect(page.locator('body')).toHaveAttribute('data-sdk-count', '3')
  await expect(page.locator('body')).toHaveAttribute('data-thumbnail', 'loaded')
  await expect(page.locator('body')).toHaveAttribute('data-media', 'loaded')
  await expect(page.locator('body')).toHaveAttribute('data-api', 'true')
  await expect.poll(() => loadedFrames.length).toBe(2)
  await expect(page.locator('body')).not.toHaveAttribute('data-blocked', 'yes')
})
