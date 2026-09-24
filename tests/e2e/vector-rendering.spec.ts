import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { appModuleUrl } from './app-module'
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
    samples: { zoom: number; layoutZoom: string }[]
    stop?: () => void
  }
}

async function openExample(page: Page, file: string) {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Open / }).click()
  await (await chooser).setFiles(resolve('examples', file))
}

async function observeCamera(page: Page) {
  await page.evaluate(
    async ({ cameraUrl, documentUrl }) => {
      const camera: StoreApi<RenderingCamera> = (await import(cameraUrl)).useCameraStore
      const document: StoreApi<{ document: CanvasDocument }> = (await import(documentUrl))
        .useDocumentStore
      const w = window as unknown as RenderingWindow
      w.rendering = { camera, document, original: document.getState().document, samples: [] }
      const layer = window.document.querySelector<HTMLElement>('[data-testid="world-layer"]')!
      w.rendering.stop = camera.subscribe((state, previous) => {
        if (state.animationActive && state.camera !== previous.camera) {
          w.rendering.samples.push({
            zoom: state.camera.zoom,
            layoutZoom: (layer.firstElementChild as HTMLElement).style.zoom
          })
        }
      })
    },
    {
      cameraUrl: appModuleUrl('store/camera-store.ts'),
      documentUrl: appModuleUrl('store/document-store.ts')
    }
  )
}

async function waitForArrival(page: Page) {
  await page.waitForFunction(
    () => !(window as unknown as RenderingWindow).rendering.camera.getState().isAnimating()
  )
}

test('animates dense vector frame-list flights without changing the document @webkit', async ({
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
    expect(flight.samples.every((sample) => sample.layoutZoom === '1')).toBe(true)
  }
  await page.evaluate(() => (window as unknown as RenderingWindow).rendering.stop?.())
})

test('keeps a light editor document uncomposited and settles its layout after zooming @webkit', async ({
  page,
  browserName
}) => {
  await page.goto('/')
  await openExample(page, 'anatomy/the-body.canvaslide')
  await expect(page.locator('[data-element-type="shape"]')).toHaveCount(2459)
  const layer = page.getByTestId('world-layer')
  await expect(layer).toHaveCSS('will-change', browserName === 'chromium' ? 'auto' : 'transform')
  // Why: always exercise the discard prompt instead of relying on post-load dirty state.
  await page.getByRole('textbox', { name: 'Document name' }).fill('Compositing transition')
  const discardPrompt = page.waitForEvent('dialog').then(async (dialog) => {
    expect(dialog.type()).toBe('confirm')
    expect(dialog.message()).toBe('You have unsaved changes. Discard them?')
    await dialog.accept()
  })
  await Promise.all([discardPrompt, openExample(page, 'flowchart/order-fulfillment.canvaslide')])
  await expect(page.locator('[data-element-type="shape"]')).toHaveCount(11)
  await expect(layer).toHaveCSS('will-change', 'auto')
  await observeCamera(page)
  const duringPan = await page.evaluate(() => {
    const { camera } = (window as unknown as RenderingWindow).rendering
    camera.getState().panBy(10, 0)
    return window.document.querySelector<HTMLElement>('[data-testid="world-layer"]')!.style
      .willChange
  })
  // A light world is painted through its transform: no transient backing store while panning.
  expect(duringPan).toBe('auto')
  await expect(layer).toHaveCSS('will-change', 'auto')
  await page.evaluate(() => {
    const { camera } = (window as unknown as RenderingWindow).rendering
    camera.getState().animateTo({ x: 20, y: 30, zoom: 4 }, 350)
  })
  await waitForArrival(page)
  // Even without a compositing hint, the editor needs native layout resolution after landing.
  await expect(layer.locator('> div')).toHaveCSS('zoom', '4')
  await expect(layer).toHaveCSS('will-change', 'auto')
  await page.evaluate(() => (window as unknown as RenderingWindow).rendering.stop?.())
})
