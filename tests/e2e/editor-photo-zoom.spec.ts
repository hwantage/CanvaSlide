import { expect, test } from '@playwright/test'
import { appModuleUrl } from './app-module'
import { decodeScreenshot } from './screenshot-pixels'

test.use({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 })

test('bounds Retina photo surfaces after extreme-zoom frame-list navigation @webkit', async ({
  page
}, testInfo) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/?example=inside')
  await expect(page.getByRole('textbox', { name: 'Document name' })).toHaveValue(/^INSIDE\./)
  const viewport = page.getByTestId('canvas-viewport')
  const original = await page.evaluateHandle(async (url) => {
    const { useDocumentStore } = await import(url)
    return useDocumentStore.getState().document
  }, appModuleUrl('store/document-store.ts'))

  for (const number of [10, 11, 12, 11, 10]) {
    await page
      .getByTestId('frame-row')
      .nth(number - 1)
      .locator('button')
      .first()
      .click()
    await expect
      .poll(async () => {
        return page.evaluate(async (url) => {
          const { useCameraStore } = await import(url)
          const state = useCameraStore.getState()
          const world = document.querySelector<HTMLElement>('[data-testid="world-layer"] > div')!
          const zoom = Number(world.style.zoom)
          const surfaces = [
            ...document.querySelectorAll<HTMLCanvasElement>('[data-image-detail-id]')
          ].filter((canvas) => getComputedStyle(canvas).visibility === 'visible')
          return {
            // CSSOM serializes fewer decimal places than the camera stores.
            settled: !state.isAnimating() && Math.abs(zoom - state.camera.zoom) < 0.001,
            hasDetail: surfaces.length > 0,
            bounded: surfaces.every((canvas) => {
              const style = getComputedStyle(canvas)
              return (
                Math.abs(Number.parseFloat(style.width) * zoom - canvas.width) < 1 &&
                Math.abs(Number.parseFloat(style.height) * zoom - canvas.height) < 1
              )
            }),
            crisp: surfaces.every((canvas) => {
              const rect = canvas.getBoundingClientRect()
              return Math.abs(canvas.width / rect.width - devicePixelRatio) < 0.1
            })
          }
        }, appModuleUrl('store/camera-store.ts'))
      })
      .toEqual({ settled: true, hasDetail: true, bounded: true, crisp: true })

    // DOM visibility alone misses WebKit compositor omissions. Inspect the painted canvas area.
    const screenshot = await viewport.screenshot()
    const { width, height, data } = decodeScreenshot(screenshot)
    let white = 0
    let samples = 0
    for (let y = 160; y < height - 160; y += 8) {
      for (let x = 160; x < width - 160; x += 8) {
        const offset = (y * width + x) * 4
        if (data[offset]! > 240 && data[offset + 1]! > 240 && data[offset + 2]! > 240) {
          white++
        }
        samples++
      }
    }
    await testInfo.attach(`editor-frame-${number}`, { body: screenshot, contentType: 'image/png' })
    expect(white / samples, 'the dark photo view must not become a white surface').toBeLessThan(0.1)
  }
  expect(
    await page.evaluate(
      async ({ url, original }) => {
        const { useDocumentStore } = await import(url)
        return useDocumentStore.getState().document === original
      },
      { url: appModuleUrl('store/document-store.ts'), original }
    )
  ).toBe(true)
  await original.dispose()
  expect(errors).toEqual([])
})
