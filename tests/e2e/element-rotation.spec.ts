import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { appModuleUrl } from './app-module'
import { dragOnCanvas, primaryModifier } from './canvas-gestures'
import { waitForEditor } from './editor-ready'

const shape = (page: Page) => page.locator('[data-element-type="shape"]').first()
const turn = (page: Page) => shape(page).evaluate((node) => (node as HTMLElement).style.transform)
const rotationField = (page: Page) => page.getByRole('spinbutton', { name: 'Rotation' })

/** Screen centre of an element, relative to the canvas viewport. */
async function viewportPoint(page: Page, testId: string): Promise<[number, number]> {
  const viewport = await page.getByTestId('canvas-viewport').boundingBox()
  const handle = await page.getByTestId(testId).boundingBox()
  if (!viewport || !handle) {
    throw new Error(`${testId} not laid out`)
  }
  return [handle.x + handle.width / 2 - viewport.x, handle.y + handle.height / 2 - viewport.y]
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await waitForEditor(page)
  await page.keyboard.press('r')
  // 200×80 box centred on (400, 340).
  await dragOnCanvas(page, [300, 300], [500, 380])
  await expect(shape(page)).toHaveCount(1)
})

test('rotation handle turns a shape in 15° steps with Shift, as one undo step @core-interaction', async ({
  page
}) => {
  const handle = await viewportPoint(page, 'rotation-handle')
  await page.keyboard.down('Shift')
  // From straight above the centre to just below its right-hand side: about 97°, snapped to 90°.
  await dragOnCanvas(page, handle, [500, 352])
  await page.keyboard.up('Shift')
  await expect.poll(() => turn(page)).toBe('rotate(90deg)')
  await expect(rotationField(page)).toHaveValue('90')
  await expect(page.getByTestId('rotation-angle')).toHaveCount(0)
  // The turned box's handles follow it: its top edge now faces right.
  const [x, y] = await viewportPoint(page, 'rotation-handle')
  expect(x).toBeGreaterThan(460)
  expect(Math.abs(y - 340)).toBeLessThan(2)

  const modifier = await primaryModifier(page)
  await page.keyboard.press(`${modifier}+z`)
  await expect.poll(() => turn(page)).toBe('')
  await page.keyboard.press(`${modifier}+Shift+z`)
  await expect.poll(() => turn(page)).toBe('rotate(90deg)')
})

test('typing an angle rotates the selection and hits follow the turned outline', async ({
  page
}) => {
  await rotationField(page).fill('-45')
  await expect.poll(() => turn(page)).toBe('rotate(-45deg)')
  await rotationField(page).fill('270')
  await expect.poll(() => turn(page)).toBe('rotate(-90deg)')
  // (310, 305) is inside the upright box but outside the turned one, so it clears the selection.
  await page.getByTestId('canvas-viewport').click({ position: { x: 310, y: 305 } })
  await expect(page.getByTestId('selection-bounds')).toHaveCount(0)
  // The turned bar now reaches (400, 250), outside the upright box.
  await page.getByTestId('canvas-viewport').click({ position: { x: 400, y: 250 } })
  await expect(page.getByTestId('selection-bounds')).toHaveCount(1)
})

test('resizing a rotated shape grows it along its own axes', async ({ page }) => {
  await rotationField(page).fill('90')
  await expect.poll(() => turn(page)).toBe('rotate(90deg)')
  const handles = page.getByTestId('selection-handle')
  await expect(handles).toHaveCount(8)
  // The east handle (index 3) now sits below the centre; dragging it down lengthens the shape.
  const east = await handles.nth(3).boundingBox()
  const viewport = await page.getByTestId('canvas-viewport').boundingBox()
  const from: [number, number] = [
    east!.x + east!.width / 2 - viewport!.x,
    east!.y + east!.height / 2 - viewport!.y
  ]
  expect(Math.abs(from[0] - 400)).toBeLessThan(2)
  await dragOnCanvas(page, from, [from[0], from[1] + 60])
  await expect(shape(page)).toHaveCSS('width', '260px')
  await expect(shape(page)).toHaveCSS('height', '80px')
  await expect.poll(() => turn(page)).toBe('rotate(90deg)')
})

test('exported HTML draws the shape with the same turn', async ({ page }) => {
  await rotationField(page).fill('30')
  await expect.poll(() => turn(page)).toBe('rotate(30deg)')
  await page.keyboard.press('f')
  await dragOnCanvas(page, [200, 150], [600, 530])
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  await page.getByRole('button', { name: 'Export HTML', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Export presentation' })
  await expect(dialog.getByTestId('export-size')).not.toContainText('calculating', {
    timeout: 10_000
  })
  const downloadPromise = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export…' }).click()
  const file = join(mkdtempSync(join(tmpdir(), 'uc-rotation-')), 'deck.html')
  await (await downloadPromise).saveAs(file)

  const player = await page.context().newPage()
  await player.goto(pathToFileURL(file).href)
  const exported = player.locator('.uc-shape')
  await expect(exported).toHaveCount(1)
  expect(await exported.evaluate((node) => (node as HTMLElement).style.transform)).toBe(
    'rotate(30deg)'
  )
})

test('rotated text keeps the height it measures upright when a document opens', async ({
  page
}) => {
  const heights = await page.evaluate(async (url) => {
    const { useDocumentStore } = await import(url)
    const store = useDocumentStore.getState()
    const text = (rotation: number) => ({
      id: `t${rotation}`,
      type: 'text',
      x: 300,
      y: 200 + rotation * 3,
      width: 240,
      height: 10,
      text: 'Rotated heading text',
      textStyle: { color: '#18181b', fontSize: 20, align: 'left', bold: false },
      ...(rotation ? { rotation } : {})
    })
    store.loadDocument(
      {
        ...store.document,
        elements: { t0: text(0), t30: text(30), t90: text(90) },
        order: ['t0', 't30', 't90']
      },
      null
    )
    await new Promise((resolve) => setTimeout(resolve, 500))
    const { elements } = useDocumentStore.getState().document
    return [elements.t0.height, elements.t30.height, elements.t90.height]
  }, appModuleUrl('store/document-store.ts'))
  // The measurement must read the unrotated layout box, not the turned element's screen extent.
  expect(heights[0]).toBeGreaterThan(10)
  expect(heights).toEqual([heights[0], heights[0], heights[0]])
})
