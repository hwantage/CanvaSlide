import { expect, test, type Page } from '@playwright/test'
import { dragOnCanvas, primaryModifier } from './canvas-gestures'

async function drawRectangle(page: Page, from: [number, number], to: [number, number]) {
  await page.keyboard.press('r')
  await dragOnCanvas(page, from, to)
}

/** Dispatches a synthetic paste carrying plain text, as a paste from another app would. */
async function pastePlainText(page: Page, text: string) {
  await page.evaluate((value) => {
    const data = new DataTransfer()
    data.setData('text/plain', value)
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  }, text)
}

const shapes = (page: Page) => page.locator('[data-element-type="shape"]')
const shapeFill = (page: Page, index: number) =>
  shapes(page).nth(index).locator('rect').getAttribute('fill')

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('canvas-viewport')).toBeVisible()
})

test('pastes plain text as a text element and keeps its line breaks', async ({ page }) => {
  await pastePlainText(page, 'First line\r\nSecond line\n')
  const text = page.locator('[data-element-type="text"]')
  await expect(text).toHaveCount(1)
  const rendered = await text.evaluate((element) => (element as HTMLElement).innerText)
  expect(rendered.trim()).toBe('First line\nSecond line')
  await expect(page.getByRole('heading', { name: 'Text' })).toBeVisible()
})

test('pastes into the text being edited instead of creating a new element', async ({ page }) => {
  await page.keyboard.press('t')
  await page.getByTestId('canvas-viewport').click({ position: { x: 400, y: 300 } })
  const editor = page.locator('.canvas-text-editor')
  await expect(editor).toBeFocused()
  await page.keyboard.type('Hello ')
  await editor.evaluate((element) => {
    const data = new DataTransfer()
    data.setData('text/plain', 'world')
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  })
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-element-type="text"]')).toHaveCount(1)
  await expect(page.locator('[data-element-type="text"]')).toContainText('Hello world')
})

test('shift constrains drawing to a square and moving to one axis', async ({ page }) => {
  await page.keyboard.press('r')
  await page.keyboard.down('Shift')
  await dragOnCanvas(page, [300, 300], [500, 380])
  await page.keyboard.up('Shift')
  const shape = shapes(page).first()
  await expect(shape).toHaveCSS('width', '200px')
  await expect(shape).toHaveCSS('height', '200px')

  await page.keyboard.down('Shift')
  await dragOnCanvas(page, [400, 400], [520, 430])
  await page.keyboard.up('Shift')
  await expect(shape).toHaveCSS('left', '420px')
  await expect(shape).toHaveCSS('top', '300px')
})

test('right-click menu selects the element under the cursor and runs commands', async ({
  page
}) => {
  await drawRectangle(page, [300, 300], [400, 400])
  await drawRectangle(page, [600, 300], [700, 400])
  await expect(shapes(page)).toHaveCount(2)
  await page.getByTestId('canvas-viewport').click({ position: { x: 350, y: 350 }, button: 'right' })
  const menu = page.getByTestId('context-menu')
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: 'Duplicate' }).click()
  await expect(menu).toHaveCount(0)
  await expect(shapes(page)).toHaveCount(3)
  await expect(shapes(page).last()).toHaveCSS('left', '324px')

  await page.getByTestId('canvas-viewport').click({ position: { x: 650, y: 350 }, button: 'right' })
  await menu.getByRole('menuitem', { name: 'Delete' }).click()
  await expect(shapes(page)).toHaveCount(2)

  await page.getByTestId('canvas-viewport').click({ position: { x: 900, y: 700 }, button: 'right' })
  await expect(menu.getByRole('menuitem', { name: 'Select all' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
})

test('right-click menu keeps its width and stays inside the viewport near the edges', async ({
  page
}) => {
  const canvas = page.getByTestId('canvas-viewport')
  const box = await canvas.boundingBox()
  if (!box) {
    throw new Error('canvas not laid out')
  }
  const menu = page.getByTestId('context-menu')
  const openMenuAt = async (x: number, y: number) => {
    await canvas.click({ position: { x, y }, button: 'right' })
    await expect(menu).toBeVisible()
    const rect = await menu.boundingBox()
    if (!rect) {
      throw new Error('menu not laid out')
    }
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    return rect
  }

  await drawRectangle(page, [300, 300], [400, 400])
  await drawRectangle(page, [box.width - 120, 300], [box.width - 20, 400])
  await drawRectangle(page, [300, box.height - 120], [400, box.height - 20])
  await expect(shapes(page)).toHaveCount(3)

  const open = await openMenuAt(350, 350)
  expect(open.width).toBeGreaterThan(0)

  // Why: the side panel sits right of the canvas, so this is the edge the issue reports.
  const right = await openMenuAt(box.width - 30, 350)
  expect(right.width).toBeCloseTo(open.width, 0)
  expect(right.height).toBeCloseTo(open.height, 0)
  expect(right.x).toBeGreaterThanOrEqual(box.x)
  expect(right.x + right.width).toBeLessThanOrEqual(box.x + box.width)

  const bottom = await openMenuAt(350, box.height - 30)
  expect(bottom.width).toBeCloseTo(open.width, 0)
  expect(bottom.height).toBeCloseTo(open.height, 0)
  expect(bottom.y).toBeGreaterThanOrEqual(box.y)
  expect(bottom.y + bottom.height).toBeLessThanOrEqual(box.y + box.height)
})

test('wraps the selection in a frame with padding', async ({ page }) => {
  await drawRectangle(page, [300, 300], [400, 400])
  await drawRectangle(page, [500, 350], [700, 450])
  const mod = await primaryModifier(page)
  await page.keyboard.press(`${mod}+a`)
  await page.keyboard.press(`${mod}+Shift+f`)
  const frame = page.locator('[data-element-type="frame"]')
  await expect(frame).toHaveCount(1)
  await expect(frame).toHaveCSS('left', '252px')
  await expect(frame).toHaveCSS('top', '252px')
  await expect(frame).toHaveCSS('width', '496px')
  await expect(frame).toHaveCSS('height', '246px')
  await expect(page.getByTestId('frame-row')).toHaveCount(1)
})

test('steps z-order one position at a time', async ({ page }) => {
  await drawRectangle(page, [300, 300], [400, 400])
  await drawRectangle(page, [450, 300], [550, 400])
  await drawRectangle(page, [600, 300], [700, 400])
  const mod = await primaryModifier(page)
  await page.getByTestId('canvas-viewport').click({ position: { x: 350, y: 350 } })
  await page.keyboard.press(`${mod}+]`)
  await expect(shapes(page).nth(1)).toHaveCSS('left', '300px')
  await page.keyboard.press(`${mod}+]`)
  await expect(shapes(page).nth(2)).toHaveCSS('left', '300px')
  await page.keyboard.press(`${mod}+[`)
  await expect(shapes(page).nth(1)).toHaveCSS('left', '300px')
  await page.keyboard.press(`${mod}+Shift+[`)
  await expect(shapes(page).nth(0)).toHaveCSS('left', '300px')
})

test('zooms to the selection with shift+2 and the toolbar button', async ({ page }) => {
  await drawRectangle(page, [300, 300], [400, 400])
  const zoom = page.getByTestId('zoom-level')
  await expect(zoom).toHaveText('100%')
  await page.keyboard.press('Shift+2')
  await expect(zoom).toHaveText('400%')
  await page.keyboard.press('Shift+1')
  await expect(zoom).toHaveText('100%')
  await page.getByRole('button', { name: /Zoom to selection/ }).click()
  await expect(zoom).toHaveText('400%')
})

test('enter edits the selected shape text and F2 renames the selected frame', async ({ page }) => {
  await drawRectangle(page, [300, 300], [500, 400])
  await page.keyboard.press('Enter')
  const editor = page.locator('.canvas-text-editor')
  await expect(editor).toBeFocused()
  await page.keyboard.type('Label')
  await page.keyboard.press('Escape')
  await expect(shapes(page).first()).toContainText('Label')

  await page.keyboard.press('f')
  await dragOnCanvas(page, [700, 300], [1000, 500])
  await page.keyboard.press('F2')
  const nameEditor = page.getByTestId('frame-name-editor')
  await expect(nameEditor).toBeFocused()
  await page.keyboard.type('Intro')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('frame-row')).toContainText('Intro')
})

test('hex entry, no fill and recent colours in the colour field', async ({ page }) => {
  await drawRectangle(page, [300, 300], [400, 400])
  await page.getByRole('button', { name: 'Fill' }).click()
  const hex = page.getByTestId('color-hex')
  await hex.fill('ff0000')
  await hex.press('Enter')
  expect(await shapeFill(page, 0)).toBe('#ff0000')
  await page.getByTestId('color-none').click()
  expect(await shapeFill(page, 0)).toBe('none')
  await page.getByTestId('color-recent').getByRole('button', { name: '#ff0000' }).click()
  expect(await shapeFill(page, 0)).toBe('#ff0000')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('color-popover')).toHaveCount(0)
})

test('remembers the last used style for new shapes and copies style between elements', async ({
  page
}) => {
  await drawRectangle(page, [300, 300], [400, 400])
  await page.getByRole('button', { name: 'Fill' }).click()
  const hex = page.getByTestId('color-hex')
  await hex.fill('#00ff00')
  await hex.press('Enter')
  await page.keyboard.press('Escape')
  await drawRectangle(page, [500, 300], [600, 400])
  expect(await shapeFill(page, 1)).toBe('#00ff00')

  const mod = await primaryModifier(page)
  await page.getByTestId('canvas-viewport').click({ position: { x: 550, y: 350 } })
  await page.getByRole('button', { name: 'Fill' }).click()
  await hex.fill('#0000ff')
  await hex.press('Enter')
  await page.keyboard.press('Escape')
  await page.keyboard.press(`Alt+${mod}+c`)
  await page.getByTestId('canvas-viewport').click({ position: { x: 350, y: 350 } })
  await page.keyboard.press(`Alt+${mod}+v`)
  expect(await shapeFill(page, 0)).toBe('#0000ff')
  await expect(shapes(page).first()).toHaveCSS('left', '300px')
})

test('drops an image file onto the canvas at the pointer', async ({ page }) => {
  const canvas = page.getByTestId('canvas-viewport')
  await canvas.evaluate((element) => {
    // 1×1 red PNG.
    const base64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const file = new File([bytes], 'dot.png', { type: 'image/png' })
    const data = new DataTransfer()
    data.items.add(file)
    const rect = element.getBoundingClientRect()
    const init = { dataTransfer: data, bubbles: true, cancelable: true }
    element.dispatchEvent(
      new DragEvent('dragover', { ...init, clientX: rect.left + 400, clientY: rect.top + 300 })
    )
    element.dispatchEvent(
      new DragEvent('drop', { ...init, clientX: rect.left + 400, clientY: rect.top + 300 })
    )
  })
  const image = page.locator('[data-element-type="image"]')
  await expect(image).toHaveCount(1)
  // Why: Chromium rounds synthetic event coordinates to whole pixels, so allow sub-pixel drift.
  const viewport = (await canvas.boundingBox())!
  const bounds = (await image.boundingBox())!
  expect(Math.abs(bounds.x - viewport.x - 399.5)).toBeLessThan(1)
  expect(Math.abs(bounds.y - viewport.y - 299.5)).toBeLessThan(1)
})

test('starts the slide show from the selected frame', async ({ page }) => {
  await page.keyboard.press('f')
  await dragOnCanvas(page, [100, 150], [400, 320])
  await page.keyboard.press('f')
  await dragOnCanvas(page, [700, 500], [1000, 800])
  await page.getByTestId('frame-row').nth(1).click()
  const mod = await primaryModifier(page)
  await page.keyboard.press(`${mod}+Shift+Enter`)
  await expect(page.getByTestId('presentation-counter')).toContainText('2 / 2')
  await page.keyboard.press('Escape')
  await page.getByTestId('frame-row').nth(0).hover()
  await page.getByRole('button', { name: 'Slide show from this frame' }).first().click()
  await expect(page.getByTestId('presentation-counter')).toContainText('1 / 2')
})

test('opens the shortcut help with ? and the toolbar button', async ({ page }) => {
  await page.keyboard.press('Shift+/')
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Bring forward')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await page.getByRole('button', { name: /Keyboard shortcuts/ }).click()
  await expect(dialog).toBeVisible()
})
