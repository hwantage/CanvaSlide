import { expect, test, type Page } from '@playwright/test'
import { appModuleUrl } from './app-module'
import { decodeScreenshot } from './screenshot-pixels'
import type { StoreApi } from 'zustand'
import type { Camera, CanvasDocument } from '../../src/shared/canvas/element-types'

type TourWindow = {
  tour: {
    camera: StoreApi<{
      camera: Camera
      setCamera: (camera: Camera) => void
      isAnimating: () => boolean
    }>
    document: StoreApi<{ document: CanvasDocument }>
    original: CanvasDocument
  }
}

const waitForArrival = (page: Page) =>
  page.waitForFunction(
    () => !(window as unknown as TourWindow).tour.camera.getState().isAnimating()
  )

const VIEWPORT = { width: 2048, height: 1136 }

/** Reads a device-pixel screenshot at CSS coordinates, as the page's own layout places them. */
function screenshotReader(screenshot: Buffer) {
  const { width, data } = decodeScreenshot(screenshot)
  const scale = width / VIEWPORT.width
  return {
    pixelWidth: width,
    at(x: number, y: number) {
      const i = (Math.round(y * scale) * width + Math.round(x * scale)) * 4
      return [data[i]!, data[i + 1]!, data[i + 2]!] as const
    }
  }
}

function kidneyPixels(screenshot: Buffer) {
  const image = screenshotReader(screenshot)
  let whiteTiles = 0,
    leftRed = 0,
    rightRed = 0
  // Sample the painted page, not DOM visibility: missing compositor tiles still have DOM boxes.
  for (let top = 64; top < VIEWPORT.height - 96; top += 32) {
    for (let left = 64; left < VIEWPORT.width - 96; left += 32) {
      let white = 0
      for (let y = top; y < top + 32; y += 2) {
        for (let x = left; x < left + 32; x += 2) {
          const [r, g, b] = image.at(x, y)
          if (r > 230 && g > 230 && b > 230) {
            white++
          }
          if (r > 150 && r > g * 1.4 && r > b * 1.4) {
            if (x < VIEWPORT.width / 2) {
              leftRed++
            } else {
              rightRed++
            }
          }
        }
      }
      if (white > 250) {
        whiteTiles++
      }
    }
  }
  return { whiteTiles, leftRed, rightRed, pixelWidth: image.pixelWidth }
}

function missingEditorPixels(before: Buffer, after: Buffer) {
  const reference = screenshotReader(before)
  const restored = screenshotReader(after)
  let dark = 0,
    missing = 0
  // Ignore editor chrome and compare only pixels that were dark before the tour.
  for (let y = 100; y < VIEWPORT.height - 100; y += 2) {
    for (let x = 100; x < VIEWPORT.width - 400; x += 2) {
      if (reference.at(x, y).every((channel) => channel < 100)) {
        dark++
        if (restored.at(x, y).every((channel) => channel > 230)) {
          missing++
        }
      }
    }
  }
  return { dark, missing }
}

test.use({ viewport: VIEWPORT, deviceScaleFactor: 2 })

for (const exitFrame of [18, 20]) {
  test(`paints anatomy and restores editing after slide ${exitFrame} at Retina density @webkit`, async ({
    page,
    browserName
  }, testInfo) => {
    test.setTimeout(90_000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/?example=anatomy')
    await expect(page.locator('[data-element-type="shape"]')).toHaveCount(2459)
    await expect(page.getByTestId('frame-row')).toHaveCount(20)
    const world = page.getByTestId('world-layer')
    const editorHint = browserName === 'chromium' ? 'auto' : 'transform'
    await expect(world).toHaveCSS('will-change', editorHint)
    await page.evaluate(
      async ({ cameraUrl, documentUrl }) => {
        const camera = (await import(cameraUrl)).useCameraStore
        const document = (await import(documentUrl)).useDocumentStore
        ;(window as unknown as TourWindow).tour = {
          camera,
          document,
          original: document.getState().document
        }
      },
      {
        cameraUrl: appModuleUrl('store/camera-store.ts'),
        documentUrl: appModuleUrl('store/document-store.ts')
      }
    )
    const editorCamera = { zoom: 0.04, x: 400, y: 100 }
    await waitForArrival(page)
    await page.evaluate((camera) => {
      ;(window as unknown as TourWindow).tour.camera.getState().setCamera(camera)
    }, editorCamera)
    const editorBefore = await page.screenshot()
    await page.getByRole('button', { name: 'Slide Show', exact: true }).click()
    await expect(world).toHaveCSS('will-change', browserName === 'firefox' ? 'transform' : 'auto')
    await waitForArrival(page)
    for (let number = 2; number <= exitFrame; number++) {
      await page.keyboard.press('ArrowRight')
      await expect(page.getByTestId('presentation-counter')).toHaveText(
        new RegExp(`^${number} / 20`)
      )
      await waitForArrival(page)
      if ([7, 8, 17].includes(number)) {
        const screenshot = await page.screenshot()
        await testInfo.attach(`anatomy-${number}`, { body: screenshot, contentType: 'image/png' })
        if (number === 8) {
          const pixels = kidneyPixels(screenshot)
          expect(pixels.pixelWidth).toBe(4096)
          expect(pixels.whiteTiles, 'no large white omission inside the dark kidney view').toBe(0)
          expect(pixels.leftRed, 'the kidney is painted').toBeGreaterThan(1000)
          expect(pixels.rightRed, 'the nephron detail is painted').toBeGreaterThan(200)
        }
      }
    }
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('presentation-counter')).toHaveCount(0)
    await waitForArrival(page)
    await expect(world).toHaveCSS('will-change', editorHint)
    expect(
      await page.evaluate(() => (window as unknown as TourWindow).tour.camera.getState().camera)
    ).toEqual(editorCamera)
    const editorAfter = await page.screenshot()
    await testInfo.attach('editor-before-slideshow', {
      body: editorBefore,
      contentType: 'image/png'
    })
    await testInfo.attach(`editor-after-slide-${exitFrame}`, {
      body: editorAfter,
      contentType: 'image/png'
    })
    const pixels = missingEditorPixels(editorBefore, editorAfter)
    expect(pixels.dark, 'the reference contains a substantial painted world').toBeGreaterThan(
      100_000
    )
    expect(
      pixels.missing / pixels.dark,
      'dark editor content must not turn white on exit'
    ).toBeLessThan(0.005)
    // Returning to editing must still navigate the dense world and leave its contents intact.
    await page.getByTestId('frame-row').nth(7).locator('button').first().click()
    await waitForArrival(page)
    expect(
      await page.evaluate(() => {
        const { document, original } = (window as unknown as TourWindow).tour
        return document.getState().document === original
      })
    ).toBe(true)
    expect(errors).toEqual([])
  })
}
