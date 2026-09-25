import { appModuleUrl } from './app-module'
import { encodeDocumentFixture } from './saved-document'
import { expect, test, type Page } from '@playwright/test'
import type { Camera } from '../../src/shared/canvas/element-types'

test.use({ deviceScaleFactor: 2 })

async function camera(page: Page, value: Camera, duration = 0) {
  await page.evaluate(
    async ({ url, value, duration }) => {
      const { useCameraStore } = await import(url)
      useCameraStore.getState().animateTo(value, duration)
    },
    { url: appModuleUrl('store/camera-store.ts'), value, duration }
  )
}

async function openDetailDocument(page: Page) {
  await page.goto('/')
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const ctx = c.getContext('2d')!
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, 64, 64)
    return c.toDataURL()
  })
  const stripes = Array.from(
    { length: 128 },
    (_, x) => `<rect x="${x / 2}" width=".25" height="100%" fill="black"/>`
  ).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 32"><defs><mask id="fade"><rect width="100%" height="100%" fill="white" opacity=".5"/>${stripes}</mask></defs><image href="${png}" width="100%" height="100%" preserveAspectRatio="none" mask="url(#fade)"/></svg>`
  const data = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  const photo = {
    id: 'photo',
    type: 'image',
    assetId: 'image',
    x: 0,
    y: 0,
    width: 64000,
    height: 32000,
    naturalWidth: 64000,
    naturalHeight: 32000
  }
  const frame = { ...photo, id: 'frame', type: 'frame', order: 0, name: 'Detail' }
  const doc = {
    version: 1,
    name: 'Sharp detail',
    settings: { background: 'plain', frameBorder: 'none', transitionMs: 500 },
    assets: { image: { id: 'image', mime: 'image/svg+xml', data, width: 64000, height: 32000 } },
    elements: { photo, frame },
    order: ['frame', 'photo']
  }
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Open/ }).click()
  await (
    await chooser
  ).setFiles({
    name: 'detail.canvas.json',
    mimeType: 'application/json',
    buffer: encodeDocumentFixture(doc)
  })
  await expect(page.locator('[data-element-id="photo"]')).toHaveAttribute('src', /^blob:/)
  await camera(page, { x: 40, y: 60, zoom: 0.02 })
  return doc.assets.image
}

test('restores original vector detail at Retina density without double-compositing alpha', async ({
  page
}, testInfo) => {
  await openDetailDocument(page)
  const base = page.locator('[data-element-id="photo"]')
  const tiles = page.locator('[data-image-detail-id="photo"]')
  await expect(tiles.first()).toBeVisible()
  await expect(base).toHaveCSS('visibility', 'hidden')
  const result = await tiles.first().evaluate((node) => {
    const img = node as HTMLCanvasElement
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const rect = img.getBoundingClientRect()
    return {
      width: img.width,
      height: img.height,
      screen: { width: rect.width, height: rect.height },
      dark: [...ctx.getImageData(5, 100, 1, 1).data],
      light: [...ctx.getImageData(15, 100, 1, 1).data]
    }
  })
  expect(result.width).toBeGreaterThan(64)
  expect(result.width / result.screen.width).toBeCloseTo(2, 1)
  expect(result.height / result.screen.height).toBeCloseTo(2, 1)
  expect(result.dark[0]).toBeLessThan(10)
  expect(result.light[0]).toBeGreaterThan(245)
  expect(result.dark[3]).toBe(0)
  expect(result.light[3]).toBeGreaterThanOrEqual(127)
  expect(result.light[3]).toBeLessThanOrEqual(128)

  await page.getByRole('button', { name: 'Slide Show', exact: true }).click()
  await expect(tiles.first()).toBeVisible()
  await expect(base).toHaveCSS('visibility', 'hidden')
  await testInfo.attach('retina-slideshow', {
    body: await page.screenshot(),
    contentType: 'image/png'
  })
})

test('uses previews throughout a flight and refreshes bounded crops at the new position', async ({
  page
}) => {
  await openDetailDocument(page)
  const base = page.locator('[data-element-id="photo"]')
  const tiles = page.locator('[data-image-detail-id="photo"]')
  await expect(tiles.first()).toBeVisible()
  const oldPosition = await tiles.first().evaluate((node) => (node as HTMLElement).style.transform)
  await camera(page, { x: -32000 * 8, y: -16000 * 8, zoom: 8 }, 1000)
  await expect(tiles.first()).toBeHidden()
  await expect(base).toHaveCSS('visibility', 'visible')
  await page.waitForTimeout(300)
  await expect(tiles.first()).toBeHidden()
  await expect(tiles.first()).toBeVisible()
  expect(await tiles.first().evaluate((node) => (node as HTMLElement).style.transform)).not.toBe(
    oldPosition
  )
  const stats = await tiles.evaluateAll((nodes) =>
    nodes.map((node) => {
      const img = node as HTMLCanvasElement
      const rect = img.getBoundingClientRect()
      return {
        width: img.width,
        height: img.height,
        density: img.width / rect.width
      }
    })
  )
  // One surface per image, bounded by what is visible: the tiles it was rendered from are the
  // memory bound, the surface just covers the viewport at device resolution.
  expect(stats).toHaveLength(1)
  const viewport = page.viewportSize()!
  for (const tile of stats) {
    expect(tile.width).toBeLessThanOrEqual(viewport.width * 2 + 2)
    expect(tile.height).toBeLessThanOrEqual(viewport.height * 2 + 2)
    expect(tile.density).toBeCloseTo(2, 1)
  }
  await camera(page, { x: -32000 * 8 - 450, y: -16000 * 8, zoom: 8 })
  await expect(tiles.first()).toBeHidden()
  await expect(tiles.first()).toBeVisible()
  await expect(base).toHaveCSS('visibility', 'hidden')
})

test('discards an obsolete detail render when a new camera movement interrupts it', async ({
  page
}) => {
  await openDetailDocument(page)
  await page.evaluate(async (url) => {
    const { svgDetailCache } = await import(url)
    const acquire = svgDetailCache.acquire.bind(svgDetailCache)
    const releases: (() => void)[] = []
    Object.assign(window, { releaseDetail: () => releases.splice(0).forEach((f) => f()) })
    svgDetailCache.acquire = (...args: unknown[]) => {
      const lease = acquire(...args)
      if (!args[2]) {
        return lease
      }
      return {
        ...lease,
        ready: lease.ready.then(
          (result: unknown) =>
            new Promise((resolve) => {
              releases.push(() => resolve(result))
              Object.assign(window, { pendingDetail: true })
            })
        )
      }
    }
  }, appModuleUrl('lib/svg-preview-cache.ts'))
  await camera(page, { x: 10, y: 20, zoom: 0.03 })
  await page.waitForFunction(() => 'pendingDetail' in window)
  await camera(page, { x: -10000000, y: 0, zoom: 0.03 })
  await page.evaluate(() => (window as unknown as { releaseDetail: () => void }).releaseDetail())
  await page.waitForTimeout(400)
  await expect(page.locator('[data-image-detail-id="photo"]')).toHaveCount(0)
})

test('matches original SVG pixels after cropping, filtering and changing aspect ratio', async ({
  page
}) => {
  const asset = await openDetailDocument(page)
  const differences = await page.evaluate(
    async ({ asset, url }) => {
      const { createSvgImagePreview } = await import(url)
      const differences: number[] = []
      for (const [aspect, alignment, filter] of [
        [1, 'xMidYMid meet', false],
        [2, 'none', false],
        [0.5, 'xMaxYMin slice', false],
        [1, 'xMinYMax meet', true]
      ] as const) {
        const root = new DOMParser().parseFromString(
          atob(asset.data.split(',')[1]!),
          'image/svg+xml'
        ).documentElement
        root.setAttribute('preserveAspectRatio', alignment)
        if (filter) {
          root
            .querySelector('defs')!
            .insertAdjacentHTML(
              'beforeend',
              '<filter id="soft"><feGaussianBlur stdDeviation=".1"/></filter>'
            )
          root.querySelector('image')!.setAttribute('filter', 'url(#soft)')
        }
        const data = `data:image/svg+xml;base64,${btoa(new XMLSerializer().serializeToString(root))}`
        const width = 2048
        const height = width / aspect
        const pixels = { width: width / 2, height: height / 2 }
        const crop = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }
        const preview = await createSvgImagePreview({ ...asset, data }, aspect, { crop, pixels })
        root.setAttribute('width', String(width))
        root.setAttribute('height', String(height))
        const original = new Image()
        original.src = `data:image/svg+xml;base64,${btoa(new XMLSerializer().serializeToString(root))}`
        await original.decode()
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')!
        context.drawImage(original, 0, 0)
        const expected = context.getImageData(
          width / 4,
          height / 4,
          pixels.width,
          pixels.height
        ).data
        const detailed = new Image()
        detailed.src = preview.src
        await detailed.decode()
        canvas.width = pixels.width
        canvas.height = pixels.height
        context.drawImage(detailed, 0, 0)
        const actual = context.getImageData(0, 0, pixels.width, pixels.height).data
        let error = 0
        for (let i = 0; i < actual.length; i++) {
          error += Math.abs(actual[i]! - expected[i]!)
        }
        differences.push(error / actual.length)
        preview.dispose()
        original.src = detailed.src = ''
        canvas.width = canvas.height = 0
      }
      return differences
    },
    { asset, url: appModuleUrl('lib/svg-image-preview.ts') }
  )
  for (const difference of differences) {
    expect(difference).toBeLessThan(1)
  }
})

test('keeps the fallback until all detail surfaces are ready without encoding PNGs', async ({
  page
}) => {
  await openDetailDocument(page)
  await expect(page.locator('[data-image-detail-id="photo"]').first()).toBeVisible()
  await page.evaluate(async (url) => {
    const { svgDetailCache } = await import(url)
    const acquire = svgDetailCache.acquire.bind(svgDetailCache)
    const pending: (() => void)[] = []
    Object.assign(window, {
      finishDetail: () => pending.shift()?.(),
      finishAllDetails: () => pending.splice(0).forEach((finish) => finish())
    })
    svgDetailCache.acquire = (...args: unknown[]) => {
      const lease = acquire(...args)
      return {
        ...lease,
        ready: lease.ready.then(
          (result: unknown) =>
            new Promise((resolve) => {
              pending.push(() => resolve(result))
              Object.assign(window, { pendingDetailCount: pending.length })
            })
        )
      }
    }
    HTMLCanvasElement.prototype.toBlob = () => {
      throw new Error('Detail should not encode PNGs')
    }
  }, appModuleUrl('lib/svg-preview-cache.ts'))
  await camera(page, { x: 80, y: 60, zoom: 0.021 })
  await page.waitForFunction(
    () => (window as unknown as { pendingDetailCount: number }).pendingDetailCount >= 2
  )
  await page.evaluate(() => (window as unknown as { finishDetail: () => void }).finishDetail())
  await expect(page.locator('[data-element-id="photo"]')).toHaveCSS('visibility', 'visible')
  await expect(page.locator('[data-image-detail-id="photo"]').first()).toBeHidden()
  await page.evaluate(() =>
    (window as unknown as { finishAllDetails: () => void }).finishAllDetails()
  )
  await expect(page.locator('[data-image-detail-id="photo"]').first()).toBeVisible()
  await expect(page.locator('[data-element-id="photo"]')).toHaveCSS('visibility', 'hidden')
})

test('pauses background detail during edits even when the camera and image stay still', async ({
  page
}) => {
  await openDetailDocument(page)
  const tiles = page.locator('[data-image-detail-id="photo"]')
  await expect(tiles.first()).toBeVisible()
  const documentUrl = appModuleUrl('store/document-store.ts')
  await page.evaluate(async (url) => {
    const { useDocumentStore } = await import(url)
    useDocumentStore.getState().beginEdit()
    useDocumentStore.getState().patchElements(['frame'], { name: 'Editing the frame' }, false)
  }, documentUrl)
  await expect(tiles.first()).toBeHidden()
  await expect(page.locator('[data-element-id="photo"]')).toHaveCSS('visibility', 'visible')
  await page.waitForTimeout(500)
  await expect(tiles.first()).toBeHidden()
  await page.evaluate(async (url) => {
    const { useDocumentStore } = await import(url)
    useDocumentStore.getState().endEdit()
  }, documentUrl)
  await expect(tiles.first()).toBeVisible()
})

test('replaces translucent previews and detail in the same paint @webkit', async ({ page }) => {
  await openDetailDocument(page)
  await expect(page.locator('[data-image-detail-id="photo"]')).toBeVisible()
  const states = await page.evaluate(async (url) => {
    const { useCameraStore } = await import(url)
    useCameraStore.getState().animateTo({ x: 80.3, y: 60.7, zoom: 0.023 }, 200)
    const states: { preview: boolean; detail: boolean }[] = []
    await new Promise<void>((resolve) => {
      const start = performance.now()
      const tick = () => {
        const preview = document.querySelector('[data-element-id="photo"]')!
        const detail = document.querySelector('[data-image-detail-id="photo"]')
        const style = detail && getComputedStyle(detail)
        states.push({
          preview: getComputedStyle(preview).visibility === 'visible',
          detail: !!style && style.visibility === 'visible' && Number(style.opacity) > 0
        })
        if (performance.now() - start > 1600) {
          resolve()
        } else {
          requestAnimationFrame(tick)
        }
      }
      requestAnimationFrame(tick)
    })
    return states
  }, appModuleUrl('store/camera-store.ts'))
  expect(states.some((s) => s.preview && !s.detail)).toBe(true)
  expect(states.some((s) => !s.preview && s.detail)).toBe(true)
  expect(states.filter((s) => s.preview === s.detail)).toEqual([])
})

test('preserves translucent bitmap alpha at fractional crop edges @webkit', async ({ page }) => {
  const asset = await openDetailDocument(page)
  const alpha = await page.evaluate(
    async ({ asset, url }) => {
      const { createSvgImagePreview } = await import(url)
      const root = new DOMParser().parseFromString(atob(asset.data.split(',')[1]!), 'image/svg+xml')
      root.querySelectorAll('mask rect[fill="black"]').forEach((rect) => rect.remove())
      const data = `data:image/svg+xml;base64,${btoa(new XMLSerializer().serializeToString(root))}`
      const detail = await createSvgImagePreview(
        { ...asset, data },
        2,
        {
          crop: { x: 0.123456789, y: 0.287654321, width: 0.006543219, height: 0.004321987 },
          pixels: { width: 257, height: 193 }
        },
        undefined,
        'canvas'
      )
      const canvas = detail.canvas as HTMLCanvasElement
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
      let min = 255,
        max = 0
      for (let i = 3; i < pixels.length; i += 4) {
        min = Math.min(min, pixels[i]!)
        max = Math.max(max, pixels[i]!)
      }
      detail.dispose()
      return { min, max }
    },
    { asset, url: appModuleUrl('lib/svg-image-preview.ts') }
  )
  expect(alpha.min).toBeGreaterThanOrEqual(127)
  expect(alpha.max).toBeLessThanOrEqual(128)
})
