import { expect, test, type Page } from '@playwright/test'
import {
  createEmptyDocument,
  defaultShapeStyle,
  defaultTextStyle,
  type Camera,
  type CanvasDocument,
  type CanvasElement
} from '../../src/shared/canvas/element-types'
import { appModuleUrl } from './app-module'
import { primaryModifier } from './canvas-gestures'

function scene(): CanvasDocument {
  const doc = createEmptyDocument()
  const shape = (id: string, x: number, y: number): CanvasElement => ({
    id,
    type: 'shape',
    shape: 'rectangle',
    x,
    y,
    width: 100,
    height: 100,
    style: { ...defaultShapeStyle, stroke: '#52525b', fill: '#e4e4e7' },
    text: '',
    textStyle: defaultTextStyle
  })
  const elements: CanvasElement[] = [
    {
      id: 'frame',
      type: 'frame',
      name: 'Outer',
      order: 0,
      x: 400,
      y: 200,
      width: 450,
      height: 350
    },
    {
      id: 'inner',
      type: 'frame',
      name: 'Inner',
      order: 1,
      x: 450,
      y: 250,
      width: 200,
      height: 200
    },
    shape('a', 100, 100),
    shape('b', 280, 100),
    shape('child', 480, 290),
    shape('c', 900, 600)
  ]
  doc.elements = Object.fromEntries(elements.map((element) => [element.id, element]))
  doc.order = elements.map((element) => element.id)
  return doc
}

async function loadScene(page: Page, doc = scene(), camera: Camera = { x: 0, y: 0, zoom: 1 }) {
  await page.goto('/')
  await page.getByTestId('canvas-viewport').waitFor()
  await page.evaluate(
    async ({ doc, camera, docUrl, cameraUrl }) => {
      const { useDocumentStore } = await import(docUrl)
      const { useCameraStore } = await import(cameraUrl)
      useDocumentStore.getState().loadDocument(doc, null)
      useCameraStore.getState().setCamera(camera)
    },
    {
      doc,
      camera,
      docUrl: appModuleUrl('store/document-store.ts'),
      cameraUrl: appModuleUrl('store/camera-store.ts')
    }
  )
  await expect(page.locator('[data-element-id="a"]')).toBeVisible()
}

async function move(page: Page, x: number, y: number) {
  const bounds = await page.getByTestId('canvas-viewport').boundingBox()
  if (!bounds) {
    throw new Error('Canvas is not laid out')
  }
  await page.mouse.move(bounds.x + x, bounds.y + y, { steps: 6 })
}

async function start(page: Page, x: number, y: number) {
  await move(page, x, y)
  await page.mouse.down()
}

async function selectedIds(page: Page): Promise<string[]> {
  return page.evaluate(async (url) => {
    const { useDocumentStore } = await import(url)
    return ([...useDocumentStore.getState().selectedIds] as string[]).sort()
  }, appModuleUrl('store/document-store.ts'))
}

async function expectSelection(page: Page, ids: string[], outlinedIds = ids) {
  const sorted = [...ids].sort()
  await expect.poll(() => selectedIds(page)).toEqual(sorted)
  await expect
    .poll(() =>
      page
        .locator('[data-selection-id]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-selection-id')!).sort())
    )
    .toEqual([...outlinedIds].sort())
}

test('marquee outlines each intersecting object live and releases the same selection @webkit', async ({
  page
}) => {
  await loadScene(page)
  await start(page, 70, 70)
  await move(page, 310, 150)
  await expectSelection(page, ['a', 'b'])
  await expect(page.getByTestId('selection-handle')).toHaveCount(0)
  await expect(page.getByTestId('selection-bounds')).toHaveCount(0)
  await expect(page.locator('[data-selection-id="a"]')).toHaveCSS('pointer-events', 'none')
  await expect(page.locator('[data-selection-id="a"]')).toHaveCSS('border-top-width', '1px')
  const marqueeColor = await page
    .getByTestId('selection-marquee')
    .evaluate((node) => getComputedStyle(node).borderTopColor)
  await expect(page.locator('[data-selection-id="a"]')).toHaveCSS('border-top-color', marqueeColor)
  await move(page, 230, 150)
  await expectSelection(page, ['a'])
  await move(page, 90, 90)
  await expectSelection(page, [])
  await move(page, 310, 150)
  const preview = await selectedIds(page)
  await page.mouse.up()
  await expectSelection(page, preview)
  await expect(page.getByTestId('selection-marquee')).toHaveCount(0)
  await expect(page.getByTestId('selection-handle')).toHaveCount(8)
  await expect(page.getByTestId('selection-bounds')).toHaveCount(1)
  const state = await page.evaluate(async (url) => {
    const { useDocumentStore } = await import(url)
    const s = useDocumentStore.getState()
    return { dirty: s.dirty, past: s.past.length }
  }, appModuleUrl('store/document-store.ts'))
  expect(state).toEqual({ dirty: false, past: 0 })
})

test('a finalized single selection uses one resize box while multi-selection keeps individual outlines @webkit', async ({
  page
}) => {
  await loadScene(page)
  await start(page, 70, 70)
  await move(page, 130, 130)
  await expectSelection(page, ['a'])
  await page.mouse.up()
  await expectSelection(page, ['a'], [])
  await expect(page.getByTestId('selection-bounds')).toHaveCount(1)
  await expect(page.getByTestId('selection-handle')).toHaveCount(8)
  const canvas = page.getByTestId('canvas-viewport')
  await canvas.click({ position: { x: 310, y: 130 }, modifiers: ['Shift'] })
  await expectSelection(page, ['a', 'b'])
  await canvas.click({ position: { x: 130, y: 130 }, modifiers: ['Shift'] })
  await expectSelection(page, ['b'], [])
  await expect(page.getByTestId('selection-bounds')).toHaveCount(1)
})

test('frames require full enclosure while nested contents are selected independently @webkit', async ({
  page
}) => {
  await loadScene(page)
  await start(page, 420, 220)
  await move(page, 540, 330)
  await expectSelection(page, ['child'])
  await move(page, 652, 452)
  await expectSelection(page, ['inner', 'child'])
  await move(page, 649, 452)
  await expectSelection(page, ['child'])
  await page.mouse.up()
  await page.getByTestId('canvas-viewport').click({ position: { x: 70, y: 580 } })
  await start(page, 390, 160)
  await move(page, 852, 552)
  await expectSelection(page, ['frame', 'inner', 'child'])
  await move(page, 849, 552)
  await expectSelection(page, ['inner', 'child'])
  await page.mouse.up()
  await expectSelection(page, ['inner', 'child'])
})

test('hover does not select frames and intentional title clicks still move their contents @webkit', async ({
  page
}) => {
  await loadScene(page)
  await move(page, 430, 190)
  await expectSelection(page, [])
  await move(page, 430, 220)
  await expectSelection(page, [])
  await page.getByTestId('canvas-viewport').click({ position: { x: 430, y: 190 } })
  await expectSelection(page, ['frame'], [])
  await start(page, 430, 190)
  await move(page, 430, 230)
  await page.mouse.up()
  await expect(page.locator('[data-element-id="child"]')).toHaveCSS('top', '330px')
  await page.keyboard.press(`${await primaryModifier(page)}+z`)
  await expect(page.locator('[data-element-id="child"]')).toHaveCSS('top', '290px')
})

for (const zoom of [0.5, 2]) {
  test(`reverse marquee keeps outlines aligned at zoom ${zoom} and a panned camera @webkit`, async ({
    page
  }) => {
    const camera = { x: 85, y: 95, zoom }
    await loadScene(page, scene(), camera)
    await start(page, 85 + 390 * zoom, 95 + 230 * zoom)
    await move(page, 85 + 150 * zoom, 95 + 150 * zoom)
    await expectSelection(page, ['a', 'b'])
    for (const id of ['a', 'b']) {
      const outline = await page.locator(`[data-selection-id="${id}"]`).boundingBox()
      const object = await page.locator(`[data-element-id="${id}"]`).boundingBox()
      expect(outline).not.toBeNull()
      expect(object).not.toBeNull()
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        expect(outline![key]).toBeCloseTo(object![key], 1)
      }
    }
    await page.mouse.up()
    await expectSelection(page, ['a', 'b'])
  })
}

for (const modifier of ['Shift', 'primary'] as const) {
  test(`${modifier} marquee retains its base selection and expands groups live @webkit`, async ({
    page
  }) => {
    const doc = scene()
    doc.elements.a!.groupId = doc.elements.b!.groupId = 'group'
    await loadScene(page, doc)
    await page.getByTestId('canvas-viewport').click({ position: { x: 930, y: 630 } })
    const key = modifier === 'primary' ? await primaryModifier(page) : modifier
    await page.keyboard.down(key)
    await start(page, 70, 70)
    await move(page, 130, 130)
    await expectSelection(page, ['a', 'b', 'c'])
    await move(page, 90, 90)
    await expectSelection(page, ['c'])
    await move(page, 130, 130)
    await page.mouse.up()
    await page.keyboard.up(key)
    await expectSelection(page, ['a', 'b', 'c'])
  })
}

for (const cancel of ['Escape', 'pointercancel', 'blur'] as const) {
  test(`${cancel} clears marquee feedback and prevents the held pointer from resuming it @webkit`, async ({
    page
  }) => {
    await loadScene(page)
    await page.getByTestId('canvas-viewport').click({ position: { x: 930, y: 630 } })
    if (cancel === 'pointercancel') {
      await page.getByTestId('canvas-viewport').evaluate((node) => {
        node.addEventListener(
          'pointerdown',
          (event) => {
            node.setAttribute('data-test-pointer', String((event as PointerEvent).pointerId))
          },
          { once: true, capture: true }
        )
      })
    }
    await start(page, 70, 70)
    await move(page, 310, 150)
    await expectSelection(page, ['a', 'b'])
    if (cancel === 'Escape') {
      await page.keyboard.press('Escape')
    } else if (cancel === 'blur') {
      await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    } else {
      await page.getByTestId('canvas-viewport').evaluate((node) => {
        const pointerId = Number(node.getAttribute('data-test-pointer'))
        if (!node.hasPointerCapture(pointerId)) {
          throw new Error('The marquee did not capture the initiating pointer')
        }
        node.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId }))
      })
    }
    await move(page, 350, 190)
    await page.mouse.up()
    await expect(page.getByTestId('selection-marquee')).toHaveCount(0)
    await expectSelection(page, cancel === 'Escape' ? [] : ['c'], [])
    await start(page, 70, 70)
    await move(page, 130, 130)
    await page.mouse.up()
    await expectSelection(page, ['a'], [])
  })
}

test('text, images and connectors get individual feedback with their existing bounds @webkit', async ({
  page
}) => {
  const doc = scene()
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#a1a1aa"/></svg>'
  doc.assets.photo = {
    id: 'photo',
    mime: 'image/svg+xml',
    data: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    width: 100,
    height: 100
  }
  const elements: CanvasElement[] = [
    {
      id: 'text',
      type: 'text',
      x: 100,
      y: 330,
      width: 160,
      height: 60,
      text: 'Visible text',
      textStyle: defaultTextStyle,
      clip: { left: 0.5, right: 0, top: 0, bottom: 0 }
    },
    {
      id: 'photo',
      type: 'image',
      x: 280,
      y: 330,
      width: 100,
      height: 100,
      assetId: 'photo',
      naturalWidth: 100,
      naturalHeight: 100
    },
    {
      id: 'line',
      type: 'connector',
      x: 150,
      y: 520,
      width: 200,
      height: 20,
      start: { x: 150, y: 520 },
      end: { x: 350, y: 540 },
      route: 'straight',
      startHead: 'none',
      endHead: 'arrow',
      label: '',
      textStyle: defaultTextStyle,
      style: { stroke: '#52525b', strokeWidth: 2, dashed: false }
    }
  ]
  for (const element of elements) {
    doc.elements[element.id] = element
    doc.order.push(element.id)
  }
  await loadScene(page, doc)
  await start(page, 70, 280)
  await move(page, 170, 370)
  await expectSelection(page, [])
  await move(page, 220, 370)
  await expectSelection(page, ['text'])
  await page.mouse.up()
  await expectSelection(page, ['text'], [])
  await expect(page.getByTestId('selection-bounds')).toHaveCSS('left', '100px')
  await expect(page.getByTestId('selection-bounds')).toHaveCSS('width', '160px')
  await start(page, 70, 280)
  await move(page, 310, 400)
  await expectSelection(page, ['text', 'photo'])
  await expect(page.locator('[data-selection-id="text"]')).toHaveCSS('left', '180px')
  await expect(page.locator('[data-selection-id="text"]')).toHaveCSS('width', '80px')
  await page.mouse.up()
  await expectSelection(page, ['text', 'photo'])
  await start(page, 70, 480)
  await move(page, 320, 560)
  await expectSelection(page, ['line'])
  await expect(page.getByTestId('connector-start-handle')).toHaveCount(0)
  await page.mouse.up()
  await expectSelection(page, ['line'], [])
  await expect(page.getByTestId('selection-bounds')).toHaveCount(0)
  await expect(page.getByTestId('connector-start-handle')).toBeVisible()
  await expect(page.getByTestId('connector-end-handle')).toBeVisible()
})
