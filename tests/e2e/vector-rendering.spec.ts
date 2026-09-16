import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import type { StoreApi } from 'zustand'
import type { Camera, CanvasDocument } from '../../src/shared/canvas/element-types'

type RenderingCamera = {
  camera: Camera
  animationActive: boolean
  isAnimating: () => boolean
  panBy: (dx: number, dy: number) => void
  animateTo: (target: Camera, durationMs: number) => void
}

type RenderingWindow = {
  rendering: {
    camera: StoreApi<RenderingCamera>
    document: StoreApi<{ document: CanvasDocument }>
    original: CanvasDocument
    samples: { zoom: number; hint: string; layoutZoom: string }[]
    stop?: () => void
  }
}

async function openExample(page: Page, file: string) {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Open / }).click()
  await (await chooser).setFiles(resolve('examples', file))
}

async function observeCamera(page: Page) {
  await page.evaluate(async () => {
    const url = (name: string) =>
      performance
        .getEntriesByType('resource')
        .map((r) => r.name)
        .filter((path) => path.includes(`/src/store/${name}.ts`))
        .at(-1)!
    const camera: StoreApi<RenderingCamera> = (await import(url('camera-store'))).useCameraStore
    const document: StoreApi<{ document: CanvasDocument }> = (await import(url('document-store')))
      .useDocumentStore
    const w = window as unknown as RenderingWindow
    w.rendering = { camera, document, original: document.getState().document, samples: [] }
    const layer = window.document.querySelector<HTMLElement>('[data-testid="world-layer"]')!
    w.rendering.stop = camera.subscribe((state, previous) => {
      if (state.animationActive && state.camera !== previous.camera) {
        w.rendering.samples.push({
          zoom: state.camera.zoom,
          hint: layer.style.willChange,
          layoutZoom: (layer.firstElementChild as HTMLElement).style.zoom
        })
      }
    })
  })
}

async function waitForArrival(page: Page) {
  await page.waitForFunction(
    () => !(window as unknown as RenderingWindow).rendering.camera.getState().isAnimating()
  )
}

test('keeps dense vector frame-list flights composited without changing the document', async ({
  page
}) => {
  await page.goto('/')
  await openExample(page, 'anatomy/the-body.canvaslide')
  await expect(page.locator('[data-element-type="shape"]')).toHaveCount(2459)
  await observeCamera(page)
  for (const index of [1, 2, 10, 16]) {
    await page.evaluate(() => ((window as unknown as RenderingWindow).rendering.samples = []))
    await page.getByTestId('frame-row').nth(index).locator('button').first().click()
    await waitForArrival(page)
    const flight = await page.evaluate(() => {
      const { samples, document, original } = (window as unknown as RenderingWindow).rendering
      return { samples, unchanged: document.getState().document === original }
    })
    expect(flight.unchanged).toBe(true)
    expect(flight.samples.length).toBeGreaterThan(3)
    expect(new Set(flight.samples.map((sample) => sample.zoom)).size).toBeGreaterThan(3)
    expect(flight.samples.every((sample) => sample.hint === 'transform')).toBe(true)
    expect(flight.samples.every((sample) => sample.layoutZoom === '1')).toBe(true)
  }
  await page.evaluate(() => (window as unknown as RenderingWindow).rendering.stop?.())
})

test('releases transient compositing on a light document after opening, panning and zooming', async ({
  page
}) => {
  await page.goto('/')
  await openExample(page, 'anatomy/the-body.canvaslide')
  await expect(page.locator('[data-element-type="shape"]')).toHaveCount(2459)
  const layer = page.getByTestId('world-layer')
  await expect(layer).toHaveCSS('will-change', 'transform')
  await openExample(page, 'flowchart/order-fulfillment.canvaslide')
  await expect(page.locator('[data-element-type="shape"]')).toHaveCount(11)
  await expect(layer).toHaveCSS('will-change', 'auto')
  await observeCamera(page)
  const duringPan = await page.evaluate(() => {
    const { camera } = (window as unknown as RenderingWindow).rendering
    camera.getState().panBy(10, 0)
    return window.document.querySelector<HTMLElement>('[data-testid="world-layer"]')!.style
      .willChange
  })
  expect(duringPan).toBe('transform')
  await expect(layer).toHaveCSS('will-change', 'auto')
  await page.evaluate(() => {
    const { camera } = (window as unknown as RenderingWindow).rendering
    camera.getState().animateTo({ x: 20, y: 30, zoom: 4 }, 350)
  })
  await waitForArrival(page)
  await expect(layer.locator('> div')).toHaveCSS('zoom', '4')
  await expect(layer).toHaveCSS('will-change', 'auto')
  await page.evaluate(() => (window as unknown as RenderingWindow).rendering.stop?.())
})
