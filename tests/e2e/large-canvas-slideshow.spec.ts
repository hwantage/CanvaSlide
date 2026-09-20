import { expect, test, type Page } from '@playwright/test'
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

async function kidneyPixels(page: Page, screenshot: Buffer) {
  return page.evaluate(async (base64) => {
    const image = new Image()
    image.src = `data:image/png;base64,${base64}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = innerWidth
    canvas.height = innerHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let whiteTiles = 0,
      leftRed = 0,
      rightRed = 0
    // Sample the painted page, not DOM visibility: missing compositor tiles still have DOM boxes.
    for (let top = 64; top < canvas.height - 96; top += 32) {
      for (let left = 64; left < canvas.width - 96; left += 32) {
        let white = 0
        for (let y = top; y < top + 32; y += 2) {
          for (let x = left; x < left + 32; x += 2) {
            const i = (y * canvas.width + x) * 4
            const r = data[i]!,
              g = data[i + 1]!,
              b = data[i + 2]!
            if (r > 230 && g > 230 && b > 230) {
              white++
            }
            if (r > 150 && r > g * 1.4 && r > b * 1.4) {
              if (x < canvas.width / 2) {
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
    return { whiteTiles, leftRed, rightRed, pixelWidth: image.naturalWidth }
  }, screenshot.toString('base64'))
}

async function missingEditorPixels(page: Page, before: Buffer, after: Buffer) {
  return page.evaluate(
    async ({ before, after }) => {
      const pixels = async (base64: string) => {
        const image = new Image()
        image.src = `data:image/png;base64,${base64}`
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = innerWidth
        canvas.height = innerHeight
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data
      }
      const reference = await pixels(before)
      const restored = await pixels(after)
      let dark = 0,
        missing = 0
      // Ignore editor chrome and compare only pixels that were dark before the tour.
      for (let y = 100; y < innerHeight - 100; y += 2) {
        for (let x = 100; x < innerWidth - 400; x += 2) {
          const i = (y * innerWidth + x) * 4
          if (reference[i]! < 100 && reference[i + 1]! < 100 && reference[i + 2]! < 100) {
            dark++
            if (restored[i]! > 230 && restored[i + 1]! > 230 && restored[i + 2]! > 230) {
              missing++
            }
          }
        }
      }
      return { dark, missing }
    },
    { before: before.toString('base64'), after: after.toString('base64') }
  )
}

test.use({ viewport: { width: 2048, height: 1136 }, deviceScaleFactor: 2 })

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
    await page.evaluate(async () => {
      const url = (name: string) =>
        performance
          .getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((path) => path.includes(`/src/store/${name}.ts`))
          .at(-1)!
      const camera = (await import(url('camera-store'))).useCameraStore
      const document = (await import(url('document-store'))).useDocumentStore
      ;(window as unknown as TourWindow).tour = {
        camera,
        document,
        original: document.getState().document
      }
    })
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
          const pixels = await kidneyPixels(page, screenshot)
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
    const pixels = await missingEditorPixels(page, editorBefore, editorAfter)
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
