import { expect, test } from '@playwright/test'
import { appModuleUrl } from './app-module'
import { encodeDocumentFixture } from './saved-document'

const losslessWebp = 'UklGRh4AAABXRUJQVlA4TBEAAAAvAUAAEAdQy8oUuYCBiOh/AAA='
const animatedWebp =
  'UklGRtAAAABXRUJQVlA4WAoAAAASAAAAAQAAAQAAQU5JTQYAAAAAAAAAAABBTk1GVAAAAAAAAAAAAAEAAAEAAGQAAAJBTFBIBQAAAACAgICAAFZQOCAuAAAAMAEAnQEqAgACAAFAJiWgAANwAP6uF//+Zo/7zf95vav//9NI//ppH/9NI+U0AEFOTUZIAAAAAAAAAAAAAQAAAQAAZAAAAFZQOCAwAAAANAEAnQEqAgACAAAAJiWgAANwAP7E7///Ngf+Qf/IPv9//+k2f/0mz/+k2fHMAAAA'

for (const [label, animated, whitespace] of [
  ['Static', false, 'none'],
  ['Animated', true, 'none'],
  ['Animated with URL whitespace', true, 'outer'],
  ['Animated with MIME whitespace', true, 'mime']
] as const) {
  test(`${label} WebP keeps its intended renderer during and after a frame flight @webkit`, async ({
    page
  }) => {
    await page.goto('/')
    const bitmap = `data:image/webp;base64,${animated ? animatedWebp : losslessWebp}`
    const href =
      whitespace === 'outer'
        ? ` ${bitmap} `
        : whitespace === 'mime'
          ? bitmap.replace('data:', 'data: ')
          : bitmap
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="6408" height="3924" viewBox="0 0 1602 981"><defs><mask id="fade"><rect width="100%" height="100%" fill="white" opacity=".5"/></mask></defs><image href="${href}" width="100%" height="100%" preserveAspectRatio="none" mask="url(#fade)"/></svg>`
    const data = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
    const photo = {
      id: 'photo',
      type: 'image',
      assetId: 'photo',
      x: 0,
      y: 0,
      width: 1602,
      height: 981,
      naturalWidth: 1602,
      naturalHeight: 981
    }
    const a = {
      id: 'a',
      type: 'frame',
      order: 0,
      name: 'Departure',
      x: 0,
      y: 0,
      width: 1000,
      height: 600
    }
    const b = { ...a, id: 'b', order: 1, name: 'Arrival', x: 600, y: 250, width: 200, height: 120 }
    const doc = {
      version: 1,
      name: 'WebP motion',
      settings: { transitionMs: 600, background: 'plain', frameBorder: 'none' },
      assets: { photo: { id: 'photo', mime: 'image/svg+xml', data, width: 1602, height: 981 } },
      elements: { photo, a, b },
      order: ['photo', 'a', 'b']
    }
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: /^Open/ }).click()
    await (
      await chooser
    ).setFiles({
      name: 'webp.canvaslide',
      mimeType: 'application/json',
      buffer: encodeDocumentFixture(doc)
    })
    const image = page.locator('img[data-element-id="photo"]')
    await expect(image).toHaveAttribute('src', animated ? data : /^blob:/)
    await expect
      .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
      .toBeGreaterThan(0)
    if (!animated) {
      expect(
        await image.evaluate((node: HTMLImageElement) => node.naturalWidth)
      ).toBeLessThanOrEqual(2048)
    }
    const flight = await page.evaluate(async (url) => {
      const { useCameraStore } = await import(url)
      const sources = new Set<string>()
      const before = useCameraStore.getState().camera
      document.querySelectorAll('[data-testid="frame-row"]')[1]!.querySelector('button')!.click()
      await new Promise<void>((resolve) => {
        const sample = () => {
          if (useCameraStore.getState().camera !== before) {
            sources.add(
              document.querySelector<HTMLImageElement>('img[data-element-id="photo"]')!.src
            )
          }
          if (useCameraStore.getState().isAnimating()) {
            requestAnimationFrame(sample)
          } else {
            resolve()
          }
        }
        requestAnimationFrame(sample)
      })
      return [...sources]
    }, appModuleUrl('store/camera-store.ts'))
    expect(flight.length).toBeGreaterThan(0)
    expect(flight.every((src) => (animated ? src === data : src.startsWith('blob:')))).toBe(true)
    await expect(image).toHaveAttribute('src', animated ? data : /^blob:/)
    if (animated) {
      await page.waitForTimeout(350)
      await expect(page.locator('[data-image-detail-id="photo"]')).toHaveCount(0)
      await expect(image).toBeVisible()
      const clip = { x: 1000, y: 400, width: 16, height: 16 }
      const firstFrame = await page.screenshot({ clip })
      await expect
        .poll(async () => (await page.screenshot({ clip })).equals(firstFrame), {
          intervals: [80],
          timeout: 3000
        })
        .toBe(false)
    } else {
      await expect(page.locator('[data-image-detail-id="photo"]')).toBeVisible()
    }
  })
}
