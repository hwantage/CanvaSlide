import { expect, test, type Page } from '@playwright/test'
import type { StoreApi } from 'zustand'
import type { Camera } from '../../src/shared/canvas/element-types'

type ZoomWindow = {
  zoomCamera: StoreApi<{ camera: Camera; isAnimating: () => boolean }>
}

async function openLightDeck(page: Page) {
  const textStyle = { color: '#0f172a', fontSize: 14, align: 'left', bold: false }
  const elements = [
    { id: 'wide', type: 'frame', name: 'Frame 11', order: 0, x: 0, y: 0, width: 1600, height: 900 },
    {
      id: 'close',
      type: 'frame',
      name: 'Frame 12',
      order: 1,
      x: 0,
      y: 0,
      width: 840,
      height: 472.5
    },
    ...['Small text and vectors 0123456789', '확대 후에도 선명한 텍스트와 도형'].map(
      (text, index) => ({
        id: `text-${index}`,
        type: 'text',
        x: 40,
        y: 40 + index * 40,
        width: 760,
        height: 30,
        text,
        textStyle
      })
    ),
    ...Array.from({ length: 135 }, (_, index) => ({
      id: `shape-${index}`,
      type: 'shape',
      shape: index % 2 ? 'ellipse' : 'rectangle',
      x: 40 + (index % 15) * 50,
      y: 150 + Math.floor(index / 15) * 28,
      width: 30,
      height: 18,
      text: '',
      textStyle,
      style: { fill: '#e2e8f0', stroke: '#0f172a', strokeWidth: 1, cornerRadius: 0 }
    }))
  ]
  await page.goto('/')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Open/ }).click()
  await (
    await chooser
  ).setFiles({
    name: 'zoom-sharpness.canvaslide',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 2,
        name: 'Zoom sharpness',
        elements: Object.fromEntries(elements.map((element) => [element.id, element])),
        order: elements.map((element) => element.id),
        assets: {},
        settings: { transitionMs: 300, background: 'plain', frameBorder: 'solid' },
        camera: { x: 0, y: 0, zoom: 1 }
      })
    )
  })
  await expect(page.getByTestId('frame-row')).toHaveCount(2)
  await expect(page.locator('[data-element-type="shape"]')).toHaveCount(135)
  await expect(page.locator('[data-element-type="text"]')).toHaveCount(2)
  await page.evaluate(async () => {
    const url = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((path) => path.includes('/src/store/camera-store.ts'))
      .at(-1)!
    ;(window as unknown as ZoomWindow).zoomCamera = (await import(url)).useCameraStore
  })
}

async function expectSettledResolution(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const { camera, isAnimating } = (window as unknown as ZoomWindow).zoomCamera.getState()
        const world = document.querySelector<HTMLElement>('[data-testid="world-layer"]')!
        const layout = Number((world.firstElementChild as HTMLElement).style.zoom)
        return isAnimating() ? Infinity : Math.abs(layout / Math.max(1, camera.zoom) - 1)
      })
    )
    // CSSOM serializes zoom with fewer significant digits than the camera stores.
    .toBeLessThan(1e-5)
  const zoom = await page.evaluate(
    () => (window as unknown as ZoomWindow).zoomCamera.getState().camera.zoom
  )
  const world = page.getByTestId('world-layer')
  await expect(world).toHaveCSS('will-change', 'auto')
  if (zoom >= 1) {
    expect(
      await world.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).a)
    ).toBeCloseTo(1, 6)
  }
  const shape = await page.locator('[data-element-id="shape-0"]').boundingBox()
  expect(shape!.width).toBeCloseTo(30 * zoom, 0)
  return zoom
}

test('light editor frames, wheel, pinch and zoom controls settle at native resolution @webkit', async ({
  page
}) => {
  await page.setViewportSize({ width: 1900, height: 1100 })
  await openLightDeck(page)
  await page.getByTestId('frame-row').nth(1).locator('button').first().click()
  expect(await expectSettledResolution(page)).toBeGreaterThan(1.6)

  await page.getByTestId('frame-row').nth(0).locator('button').first().click()
  await expectSettledResolution(page)
  const viewport = page.getByTestId('canvas-viewport')
  for (const deltaY of [-100, -12, 12, 100]) {
    const before = await page.evaluate(
      () => (window as unknown as ZoomWindow).zoomCamera.getState().camera.zoom
    )
    await viewport.dispatchEvent('wheel', {
      deltaY,
      deltaMode: 0,
      ctrlKey: true,
      clientX: 600,
      clientY: 300,
      bubbles: true
    })
    const after = await expectSettledResolution(page)
    expect(deltaY < 0 ? after > before : after < before).toBe(true)
  }
  for (const direction of ['in', 'out']) {
    const before = await page.evaluate(
      () => (window as unknown as ZoomWindow).zoomCamera.getState().camera.zoom
    )
    await page.getByRole('button', { name: new RegExp(`^Zoom ${direction}`) }).click()
    const after = await expectSettledResolution(page)
    expect(direction === 'in' ? after > before : after < before).toBe(true)
  }
})

test('a selected frame stays at native resolution after preview, replay and close @webkit', async ({
  page
}) => {
  await page.setViewportSize({ width: 1900, height: 1100 })
  await openLightDeck(page)
  await page.getByTestId('frame-row').nth(1).locator('button').first().click()
  const editorZoom = await expectSettledResolution(page)
  expect(editorZoom).toBeGreaterThan(1.6)
  for (const name of ['Play the flight into this frame', 'Play it again']) {
    await page.getByRole('button', { name }).click()
    await expect(page.getByTestId('preview-controls')).toBeVisible()
    expect(await expectSettledResolution(page)).toBeCloseTo(editorZoom, 6)
    await expect(page.locator('[data-element-id="text-0"]')).toBeVisible()
    await expect(page.locator('[data-element-id="text-1"]')).toBeVisible()
  }
  await page.getByRole('button', { name: 'Close the preview' }).click()
  await expect(page.getByTestId('preview-controls')).toHaveCount(0)
  expect(await expectSettledResolution(page)).toBeCloseTo(editorZoom, 6)
})
