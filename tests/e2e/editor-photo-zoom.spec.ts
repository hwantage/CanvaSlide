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
      .poll(
        async () => {
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
        },
        {
          // Tracing the first Retina navigation can exceed the default wait on macOS CI.
          // Surface geometry and painted output, rather than elapsed time, are the contract.
          timeout: 15_000,
          message: `frame ${number} should settle with bounded, sharp photo detail`
        }
      )
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

    const imageId = number === 12 ? 'image-21' : 'image-19'
    const photo = page.locator(`[data-image-detail-id="${imageId}"]`)
    await expect(photo).toBeVisible()
    // Hide other photos while capturing this surface so an underlying preview cannot mask a blank.
    const isolated = await photo.screenshot({
      style: `[data-element-type="image"], [data-image-detail-id]:not([data-image-detail-id="${imageId}"]) { visibility: hidden !important; }`
    })
    const pixels = decodeScreenshot(isolated)
    let colored = 0
    let photoSamples = 0
    for (let y = 0; y < pixels.height; y += 8) {
      for (let x = 0; x < pixels.width; x += 8) {
        const offset = (y * pixels.width + x) * 4
        const rgb = [pixels.data[offset]!, pixels.data[offset + 1]!, pixels.data[offset + 2]!]
        if (Math.max(...rgb) - Math.min(...rgb) > 20) {
          colored++
        }
        photoSamples++
      }
    }
    await testInfo.attach(`photo-${number}`, { body: isolated, contentType: 'image/png' })
    if (colored / photoSamples <= 0.1) {
      const raster = await photo.evaluate((node) => (node as HTMLCanvasElement).toDataURL())
      await testInfo.attach(`raster-${number}`, {
        body: Buffer.from(raster.split(',')[1]!, 'base64'),
        contentType: 'image/png'
      })
      await testInfo.attach(`after-readback-${number}`, {
        body: await photo.screenshot({
          style: `[data-element-type="image"], [data-image-detail-id]:not([data-image-detail-id="${imageId}"]) { visibility: hidden !important; }`
        }),
        contentType: 'image/png'
      })
    }
    expect(colored / photoSamples, `${imageId} must paint its own photo pixels`).toBeGreaterThan(
      0.1
    )
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
