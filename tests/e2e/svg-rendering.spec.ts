import { readSavedDocument } from './saved-document'
import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { primaryModifier } from './canvas-gestures'
import type { Camera } from '../../src/shared/canvas/element-types'
import type { StoreApi } from 'zustand'

type FlightCamera = {
  camera: Camera
  animationActive: boolean
  isAnimating: () => boolean
  panBy: (dx: number, dy: number) => void
  animateTo: (
    camera: Camera,
    duration: number,
    options?: { onDone?: () => void; onProgress?: (eased: number) => void }
  ) => void
}

type FlightWindow = {
  flightTest: {
    camera: StoreApi<FlightCamera>
    finish: () => void
    before: Camera
    layoutZooms: string[]
    flightHints: string[]
    hintAtArrival?: string
    unsubscribe?: () => void
  }
}

async function setCamera(page: Page, camera: Camera) {
  await page.evaluate(async (value) => {
    const url = performance
      .getEntriesByType('resource')
      .map((r) => r.name)
      .filter((name) => name.includes('/src/store/camera-store.ts'))
      .at(-1)
    if (!url) {
      throw new Error('Camera module was not loaded')
    }
    const { useCameraStore } = await import(url)
    useCameraStore.getState().setCamera(value)
  }, camera)
}

async function openMaskedImage(page: Page) {
  await page.goto('/')
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#de4267'
    ctx.fillRect(0, 0, 64, 64)
    return canvas.toDataURL()
  })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 800"><defs><mask id="fade"><rect width="100%" height="100%" fill="white" opacity=".5"/></mask></defs><image href="${png}" width="100%" height="100%" preserveAspectRatio="none" mask="url(#fade)"/></svg>`
  const data = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  const doc = {
    version: 2,
    name: 'Large masked image',
    settings: { background: 'plain', frameBorder: 'solid', transitionMs: 0 },
    camera: { x: 0, y: 0, zoom: 1 },
    assets: { photo: { id: 'photo', mime: 'image/svg+xml', data, width: 66000, height: 33000 } },
    elements: {
      first: {
        id: 'first',
        type: 'image',
        assetId: 'photo',
        x: 0,
        y: 0,
        width: 66000,
        height: 33000,
        naturalWidth: 66000,
        naturalHeight: 33000
      },
      distant: {
        id: 'distant',
        type: 'image',
        assetId: 'photo',
        x: 1000000,
        y: 0,
        width: 66000,
        height: 33000,
        naturalWidth: 66000,
        naturalHeight: 33000
      },
      frame: {
        id: 'frame',
        type: 'frame',
        name: 'Masked photo',
        order: 0,
        x: 0,
        y: 0,
        width: 66000,
        height: 33000
      }
    },
    order: ['frame', 'first', 'distant']
  }
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Open/ }).click()
  await (
    await chooser
  ).setFiles({
    name: 'masked.canvas.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc))
  })
  await expect(page.locator('[data-element-id="first"]')).toHaveCount(1)
  await setCamera(page, { x: 100, y: 120, zoom: 0.02 })
  await expect(page.locator('[data-element-id="first"]')).toHaveAttribute('src', /^blob:/)
  return doc
}

test('bounds masked SVG previews, preserves alpha, reuses them offscreen, and saves originals', async ({
  page
}) => {
  const doc = await openMaskedImage(page)
  const first = page.locator('[data-element-id="first"]')
  const source = await first.getAttribute('src')
  await expect
    .poll(() => first.evaluate((node) => (node as HTMLImageElement).naturalWidth))
    .toBe(1600)
  const pixel = await first.evaluate((node) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(node as HTMLImageElement, 0, 0, 1, 1)
    return [...ctx.getImageData(0, 0, 1, 1).data]
  })
  expect(pixel[3]).toBeGreaterThanOrEqual(127)
  expect(pixel[3]).toBeLessThanOrEqual(128)
  expect(pixel[0]).toBeGreaterThan(210)
  const distant = page.locator('[data-element-id="distant"]')
  await expect(distant).not.toHaveAttribute('src', /.+/)
  await setCamera(page, { x: 100 - 1000000 * 0.02, y: 120, zoom: 0.02 })
  await expect(distant).toHaveAttribute('src', source!)
  await expect(first).not.toHaveAttribute('src', /.+/)
  await setCamera(page, { x: 100, y: 120, zoom: 0.02 })
  await expect(first).toHaveAttribute('src', source!)

  const viewport = await page.getByTestId('canvas-viewport').boundingBox()
  if (!viewport) {
    throw new Error('Viewport was not laid out')
  }
  const initial = (await first.boundingBox())!
  await page.mouse.move(viewport.x + 350, viewport.y + 350)
  await page.mouse.down()
  await page.mouse.move(viewport.x + 450, viewport.y + 400, { steps: 8 })
  await page.mouse.up()
  await expect
    .poll(() => first.evaluate((el) => el.getBoundingClientRect().x))
    .toBeCloseTo(initial.x + 100, 3)
  await expect
    .poll(() => first.evaluate((el) => el.getBoundingClientRect().y))
    .toBeCloseTo(initial.y + 50, 3)
  await page.keyboard.press(`${await primaryModifier(page)}+z`)
  await expect
    .poll(() => first.evaluate((el) => el.getBoundingClientRect().x))
    .toBeCloseTo(initial.x, 3)
  await expect
    .poll(() => first.evaluate((el) => el.getBoundingClientRect().y))
    .toBeCloseTo(initial.y, 3)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /^Save as/ }).click()
  const path = await (await download).path()
  if (!path) {
    throw new Error('Saved file is unavailable')
  }
  const saved = readSavedDocument(await readFile(path))
  expect(saved.assets).toEqual(doc.assets)
  expect(saved.elements).toEqual(doc.elements)
})

test('keeps frame chrome sharp, aligned and editable across large zoom changes', async ({
  page
}) => {
  await openMaskedImage(page)
  const frame = page.locator('[data-element-id="frame"]')
  const chrome = page.locator('[data-frame-chrome-id="frame"]')
  for (const zoom of [0.02, 0.5, 2, 16]) {
    await setCamera(page, { x: 100, y: 200, zoom })
    await expect(chrome.locator('> div').first()).toHaveCSS('font-size', '12px')
    await expect(page.getByTestId('frame-outline')).toHaveCSS('border-top-width', '1px')
    await expect
      .poll(async () => {
        const a = await frame.boundingBox(),
          b = await chrome.boundingBox()
        return a && b
          ? Math.max(
              Math.abs(a.x - b.x),
              Math.abs(a.y - b.y),
              Math.abs(a.width - b.width),
              Math.abs(a.height - b.height)
            )
          : Infinity
      })
      .toBeLessThan(1)
  }
  await setCamera(page, { x: 100, y: 200, zoom: 0.02 })
  await page.getByTestId('canvas-viewport').dblclick({ position: { x: 200, y: 188 } })
  const editor = page.getByTestId('frame-name-editor')
  await expect(editor).toBeFocused()
  await editor.fill('Renamed at 2%')
  await editor.press('Enter')
  await expect(chrome).toContainText('Renamed at 2%')
  await page.getByRole('button', { name: 'Slide Show', exact: true }).click()
  await expect(page.getByTestId('frame-chrome-overlay')).toHaveCount(0)
})

test('keeps the previous preview visible while preparing a resized image', async ({ page }) => {
  await openMaskedImage(page)
  const first = page.locator('[data-element-id="first"]')
  const source = await first.getAttribute('src')
  await page.evaluate(async () => {
    const url = (suffix: string) =>
      performance
        .getEntriesByType('resource')
        .map((r) => r.name)
        .filter((name) => name.includes(suffix))
        .at(-1)!
    const { svgPreviewCache } = await import(url('/src/lib/svg-preview-cache.ts'))
    const { useDocumentStore } = await import(url('/src/store/document-store.ts'))
    const acquire = svgPreviewCache.acquire.bind(svgPreviewCache)
    svgPreviewCache.acquire = (...args: unknown[]) => {
      const lease = acquire(...args)
      return {
        ...lease,
        ready: lease.ready.then(
          (result: unknown) =>
            new Promise((resolve) => {
              Object.assign(window, { finishPreview: () => resolve(result) })
            })
        )
      }
    }
    useDocumentStore.getState().patchElements(['first'], { width: 33000 })
  })
  await page.waitForFunction(() => 'finishPreview' in window)
  await expect(first).toHaveAttribute('src', source!)
  await expect(first).toHaveCSS('visibility', 'visible')
  await page.evaluate(() => (window as unknown as { finishPreview: () => void }).finishPreview())
  await expect(first).toHaveAttribute('src', /^blob:/)
  await expect(first).not.toHaveAttribute('src', source!)
  await expect
    .poll(() => first.evaluate((node) => (node as HTMLImageElement).naturalHeight))
    .toBe(1600)
  const alpha = await first.evaluate((node) => {
    const img = node as HTMLImageElement
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1600
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    return [ctx.getImageData(800, 100, 1, 1).data[3], ctx.getImageData(800, 800, 1, 1).data[3]]
  })
  expect(alpha[0]).toBe(0)
  expect(alpha[1]).toBeGreaterThanOrEqual(127)
  expect(alpha[1]).toBeLessThanOrEqual(128)
})

test('waits for flight images, lets a gesture cancel preparation, and settles zoom after arrival', async ({
  page
}) => {
  await openMaskedImage(page)
  await page.waitForTimeout(150)
  await page.evaluate(async () => {
    const url = (suffix: string) =>
      performance
        .getEntriesByType('resource')
        .map((r) => r.name)
        .filter((name) => name.includes(suffix))
        .at(-1)!
    const { svgPreviewCache } = await import(url('/src/lib/svg-preview-cache.ts'))
    const { useCameraStore } = await import(url('/src/store/camera-store.ts'))
    const acquire = svgPreviewCache.acquire.bind(svgPreviewCache)
    let finish!: () => void
    const gate = new Promise<void>((resolve) => {
      finish = resolve
    })
    svgPreviewCache.acquire = (...args: unknown[]) => {
      const lease = acquire(...args)
      return {
        ...lease,
        ready: lease.ready.then(async (result: unknown) => {
          await gate
          return result
        })
      }
    }
    const state = {
      camera: useCameraStore,
      finish,
      before: useCameraStore.getState().camera,
      layoutZooms: [] as string[],
      flightHints: [] as string[]
    }
    Object.assign(window, { flightTest: state })
    useCameraStore.getState().animateTo({ x: -3999900, y: 120, zoom: 4 }, 500)
  })
  await page.waitForTimeout(200)
  await expect(page.getByTestId('world-layer')).toHaveCSS('will-change', 'auto')
  const waiting = await page.evaluate(() => {
    const f = (window as unknown as FlightWindow).flightTest
    return {
      camera: f.camera.getState().camera,
      before: f.before,
      animating: f.camera.getState().isAnimating()
    }
  })
  expect(waiting.animating).toBe(true)
  expect(waiting.camera).toEqual(waiting.before)

  await page.evaluate(() => {
    const f = (window as unknown as FlightWindow).flightTest
    f.camera.getState().panBy(30, 0)
    f.finish()
  })
  await page.waitForTimeout(600)
  const cancelled = await page.evaluate(() => {
    const f = (window as unknown as FlightWindow).flightTest
    return { camera: f.camera.getState().camera, animating: f.camera.getState().isAnimating() }
  })
  expect(cancelled.animating).toBe(false)
  expect(cancelled.camera).toEqual({ ...waiting.before, x: waiting.before.x + 30 })

  await page.evaluate(() => {
    const f = (window as unknown as FlightWindow).flightTest
    const layer = document.querySelector('[data-testid="world-layer"] > div') as HTMLElement
    f.unsubscribe = f.camera.subscribe((state, previous) => {
      if (state.animationActive && state.camera !== previous.camera) {
        f.layoutZooms.push(layer.style.zoom)
        f.flightHints.push((layer.parentElement as HTMLElement).style.willChange)
      }
    })
    f.camera.getState().animateTo({ x: -3999900, y: 120, zoom: 4 }, 500, {
      onDone: () => {
        f.hintAtArrival = (layer.parentElement as HTMLElement).style.willChange
      }
    })
  })
  await page.waitForFunction(
    () => !(window as unknown as FlightWindow).flightTest.camera.getState().isAnimating()
  )
  // The editor commits native layout resolution after arrival, keeping layout fixed during flight.
  await expect(page.getByTestId('world-layer').locator('> div')).toHaveCSS('zoom', '4')
  await expect(page.getByTestId('world-layer')).toHaveCSS('will-change', 'auto')
  const zooms = await page.evaluate(() => {
    const f = (window as unknown as FlightWindow).flightTest
    f.unsubscribe?.()
    return f.layoutZooms
  })
  expect(
    await page.evaluate(() => (window as unknown as FlightWindow).flightTest.hintAtArrival)
  ).toBe('auto')
  expect(zooms.length).toBeGreaterThan(2)
  expect(zooms.every((zoom) => Number(zoom) === 1)).toBe(true)
  expect(
    await page.evaluate(() =>
      (window as unknown as FlightWindow).flightTest.flightHints.every((hint) => hint === 'auto')
    )
  ).toBe(true)
  await expect(page.locator('[data-element-id="distant"]')).toHaveAttribute('src', /^blob:/)
})

test('holds the arrival layout across a large editor zoom-out and a same-zoom flight @webkit', async ({
  page
}) => {
  await openMaskedImage(page)
  const layer = page.getByTestId('world-layer').locator('> div')
  await setCamera(page, { x: -32000 * 32, y: -16000 * 32, zoom: 32 })
  // Native resolution is needed at rest even when the document has no compositing hint.
  await expect(layer).toHaveCSS('zoom', '32')
  const url = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((r) => r.name)
      .filter((name) => name.includes('/src/store/camera-store.ts'))
      .at(-1)!
  )
  const layouts = await page.evaluate(async (url) => {
    const { useCameraStore } = await import(url)
    const layer = document.querySelector('[data-testid="world-layer"] > div') as HTMLElement
    const seen = new Set<string>()
    const stop = useCameraStore.subscribe((state: FlightCamera, previous: FlightCamera) => {
      if (state.animationActive && state.camera !== previous.camera) {
        seen.add(layer.style.zoom)
      }
    })
    const landed = () =>
      new Promise<void>((resolve) => {
        const tick = () =>
          useCameraStore.getState().isAnimating() ? requestAnimationFrame(tick) : resolve()
        requestAnimationFrame(tick)
      })
    useCameraStore.getState().animateTo({ x: -32000 * 2, y: -16000 * 2, zoom: 2 }, 600)
    await landed()
    useCameraStore.getState().animateTo(useCameraStore.getState().camera, 600)
    await landed()
    stop()
    return [...seen]
  }, url)
  expect(layouts).toEqual(['2'])
  await expect(layer).toHaveCSS('zoom', '2')
})
