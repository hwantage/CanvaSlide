import { expect, test, type Page } from '@playwright/test'

test.use({ deviceScaleFactor: 2 })

async function state(page: Page) {
  return page.evaluate(async () => {
    const url = performance
      .getEntriesByType('resource')
      .map((r) => r.name)
      .filter((name) => name.includes('/src/store/camera-store.ts'))
      .at(-1)!
    const { useCameraStore } = await import(url)
    const s = useCameraStore.getState()
    const layer = document.querySelector<HTMLElement>('[data-testid="world-layer"] > div')!
    return { camera: s.camera, active: s.animationActive, layoutZoom: Number(layer.style.zoom) }
  })
}

async function openPreviewDocument(page: Page) {
  await page.goto('/')
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, 64, 64)
    return canvas.toDataURL()
  })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 32"><defs><mask id="fade"><rect width="100%" height="100%" fill="white" opacity=".5"/></mask></defs><image href="${png}" width="100%" height="100%" preserveAspectRatio="none" mask="url(#fade)"/></svg>`
  const data = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  const photo = {
    id: 'photo',
    type: 'image',
    assetId: 'photo',
    x: 0,
    y: 0,
    width: 64,
    height: 32,
    naturalWidth: 64,
    naturalHeight: 32
  }
  const a = {
    id: 'a',
    type: 'frame',
    order: 0,
    name: 'Departure',
    x: 10,
    y: 10,
    width: 10,
    height: 6
  }
  const b = {
    ...a,
    id: 'b',
    order: 1,
    name: 'Arrival',
    x: 12,
    y: 12,
    width: 4,
    height: 2.4
  }
  const doc = {
    version: 2,
    name: 'Reused preview',
    settings: { background: 'plain', frameBorder: 'none', transitionMs: 600 },
    assets: { photo: { id: 'photo', mime: 'image/svg+xml', data, width: 64, height: 32 } },
    elements: { photo, a, b },
    order: ['a', 'b', 'photo']
  }
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Open/ }).click()
  await (
    await chooser
  ).setFiles({
    name: 'preview.canvaslide',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc))
  })
  await page.getByTestId('frame-row').nth(1).locator('button').first().click()
  await expect(page.locator('[data-image-detail-id="photo"]').first()).toBeVisible()
  await expect.poll(async () => (await state(page)).active).toBe(false)
  await page.evaluate(async () => {
    const url = performance
      .getEntriesByType('resource')
      .map((r) => r.name)
      .filter((name) => name.includes('/src/lib/svg-preview-cache.ts'))
      .at(-1)!
    const { svgDetailCache } = await import(url)
    const acquire = svgDetailCache.acquire.bind(svgDetailCache)
    const probe = { requests: 0 }
    Object.assign(window, { previewProbe: probe })
    svgDetailCache.acquire = (...args: unknown[]) => {
      probe.requests++
      return acquire(...args)
    }
  })
}

async function requests(page: Page) {
  return page.evaluate(
    () => (window as unknown as { previewProbe: { requests: number } }).previewProbe.requests
  )
}

test('reuses the displayed arrival tiles without starting preview-only detail work @webkit', async ({
  page
}) => {
  await openPreviewDocument(page)
  const before = (await state(page)).camera
  const tiles = page.locator('[data-image-detail-id="photo"]')
  const original = await tiles.first().elementHandle()
  const pixels = await original!.evaluate((node) => (node as HTMLCanvasElement).toDataURL())
  await page.getByRole('button', { name: 'Play the flight into this frame' }).click()
  await expect.poll(async () => (await state(page)).camera).not.toEqual(before)
  const departure = (await state(page)).camera
  await page.waitForTimeout(250)
  expect((await state(page)).camera).toEqual(departure)
  expect((await state(page)).layoutZoom).toBe(Math.max(1, departure.zoom))
  await expect(tiles.first()).toBeHidden()
  await expect
    .poll(async () => (await state(page)).camera, { intervals: [10] })
    .not.toEqual(departure)
  // Both shots are at the zoom ceiling, so the flight keeps that layout instead of reflowing twice.
  expect((await state(page)).layoutZoom).toBe(before.zoom)
  const image = await page.locator('[data-element-id="photo"]').evaluate((node) => {
    const img = node as HTMLImageElement
    const world = document.querySelector<HTMLElement>('[data-testid="world-layer"]')!
    const matrix = new DOMMatrix(getComputedStyle(world).transform)
    const layoutZoom = Number((world.firstElementChild as HTMLElement).style.zoom)
    const rect = img.getBoundingClientRect()
    return { layoutWidth: img.width, worldWidth: rect.width / (matrix.a * layoutZoom) }
  })
  expect(image.layoutWidth).toBe(64)
  expect(image.worldWidth).toBeCloseTo(64)
  await expect.poll(async () => (await state(page)).active).toBe(false)
  await expect(tiles.first()).toBeVisible()
  expect((await state(page)).camera).toEqual(before)
  expect((await state(page)).layoutZoom).toBe(Math.max(1, before.zoom))
  expect(await original!.evaluate((node) => node.isConnected)).toBe(true)
  expect(await tiles.first().evaluate((node) => (node as HTMLCanvasElement).toDataURL())).toBe(
    pixels
  )
  await page.waitForTimeout(350)
  expect(await requests(page)).toBe(0)
})

test('closing during the hold restores the original detail without a later flight', async ({
  page
}) => {
  await openPreviewDocument(page)
  const before = (await state(page)).camera
  await page.getByRole('button', { name: 'Play the flight into this frame' }).click()
  await expect.poll(async () => (await state(page)).camera).not.toEqual(before)
  await page.keyboard.press('Escape')
  await expect.poll(async () => (await state(page)).active).toBe(false)
  await page.waitForTimeout(1100)
  expect((await state(page)).camera).toEqual(before)
  await expect(page.locator('[data-image-detail-id="photo"]').first()).toBeVisible()
  await expect(page.getByTestId('preview-controls')).toHaveCount(0)
  expect(await requests(page)).toBe(0)
})

test('releases detail canvases and leases after zooming out while the image stays visible', async ({
  page
}) => {
  await openPreviewDocument(page)
  await page.evaluate(async () => {
    const module = async (part: string) =>
      import(
        performance
          .getEntriesByType('resource')
          .map((r) => r.name)
          .filter((name) => name.includes(part))
          .at(-1)!
      )
    const { svgDetailCache } = await module('/src/lib/svg-preview-cache.ts')
    const { useCameraStore } = await module('/src/store/camera-store.ts')
    const tracker = { leases: 0 }
    Object.assign(window, { detailRetentionProbe: tracker })
    const acquire = svgDetailCache.acquire.bind(svgDetailCache)
    svgDetailCache.acquire = (...args: unknown[]) => {
      const lease = acquire(...args)
      tracker.leases++
      let released = false
      return {
        ...lease,
        release: () => {
          if (!released) {
            released = true
            tracker.leases--
          }
          lease.release()
        }
      }
    }
    const camera = useCameraStore.getState().camera
    useCameraStore.getState().setCamera({ ...camera, x: camera.x - 5 })
  })
  const leases = () =>
    page.evaluate(
      () =>
        (window as unknown as { detailRetentionProbe: { leases: number } }).detailRetentionProbe
          .leases
    )
  await expect.poll(leases).toBeGreaterThan(0)
  await expect(page.locator('[data-image-detail-id="photo"]').first()).toBeVisible()
  await page.evaluate(async () => {
    const url = performance
      .getEntriesByType('resource')
      .map((r) => r.name)
      .filter((name) => name.includes('/src/store/camera-store.ts'))
      .at(-1)!
    const { useCameraStore } = await import(url)
    useCameraStore.getState().setCamera({ x: 100, y: 100, zoom: 0.1 })
  })
  await expect(page.locator('[data-element-id="photo"]')).toBeVisible()
  await expect(page.locator('[data-image-detail-id="photo"]')).toHaveCount(0)
  await expect.poll(leases).toBe(0)
})

for (const mode of ['editor', 'slideshow'] as const) {
  test(`keeps the original SVG layout size during ${mode} flights`, async ({ page }) => {
    await openPreviewDocument(page)
    const measured = await page.evaluate(async (mode) => {
      const url = performance
        .getEntriesByType('resource')
        .map((r) => r.name)
        .filter((name) => name.includes('/src/store/camera-store.ts'))
        .at(-1)!
      const { useCameraStore } = await import(url)
      const widths: number[] = []
      const detailCounts: number[] = []
      const before = useCameraStore.getState().camera
      const row = document.querySelector('[data-testid="frame-row"]')!
      row.querySelectorAll('button')[mode === 'slideshow' ? 1 : 0]!.click()
      await new Promise<void>((resolve) => {
        const sample = () => {
          if (!useCameraStore.getState().isAnimating()) {
            resolve()
            return
          }
          widths.push(document.querySelector<HTMLImageElement>('[data-element-id="photo"]')!.width)
          if (useCameraStore.getState().camera !== before) {
            detailCounts.push(document.querySelectorAll('[data-image-detail-id="photo"]').length)
          }
          requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
      })
      return { widths, detailCounts }
    }, mode)
    expect(measured.widths.length).toBeGreaterThan(0)
    expect(Math.max(...measured.widths)).toBe(64)
    expect(measured.detailCounts.length).toBeGreaterThan(0)
    expect(Math.max(...measured.detailCounts)).toBe(0)
  })
}
