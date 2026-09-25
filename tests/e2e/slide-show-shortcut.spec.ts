import { expect, test, type Page } from '@playwright/test'
import { dragOnCanvas } from './canvas-gestures'
import { waitForEditor } from './editor-ready'

const controls = (page: Page) => page.getByTestId('presentation-controls')
const counter = (page: Page) => page.getByTestId('presentation-counter')

async function drawTwoFrames(page: Page) {
  await page.keyboard.press('f')
  await dragOnCanvas(page, [200, 200], [500, 450])
  await page.keyboard.press('f')
  await dragOnCanvas(page, [700, 200], [1000, 450])
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('frame-row')).toHaveCount(2)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await waitForEditor(page)
})

test('F5 starts the slide show from the first frame @core-interaction', async ({ page }) => {
  await drawTwoFrames(page)
  await page.keyboard.press('F5')
  await expect(controls(page)).toBeVisible()
  await expect(counter(page)).toContainText('1 / 2')
})

test('F5 is inert while a slide show is running @core-interaction', async ({ page }) => {
  await drawTwoFrames(page)
  await page.keyboard.press('F5')
  await expect(counter(page)).toContainText('1 / 2')
  await page.keyboard.press('ArrowRight')
  await expect(counter(page)).toContainText('2 / 2')
  await page.keyboard.press('F5')
  await expect(counter(page)).toContainText('2 / 2')
})

test('Shift+F5 starts from the selected frame @core-interaction', async ({ page }) => {
  await drawTwoFrames(page)
  await page.getByTestId('frame-row').nth(1).getByRole('button').first().click()
  await page.keyboard.press('Shift+F5')
  await expect(controls(page)).toBeVisible()
  await expect(counter(page)).toContainText('2 / 2')
})

test('F5 starts a show from the text editor and keeps the typed text @core-interaction', async ({
  page
}) => {
  await drawTwoFrames(page)
  await page.keyboard.press('t')
  await page.getByTestId('canvas-viewport').click({ position: { x: 300, y: 600 } })
  const editor = page.locator('.canvas-text-editor')
  await expect(editor).toBeFocused()
  await page.keyboard.type('Talk notes')
  await page.keyboard.press('F5')
  await expect(controls(page)).toBeVisible()
  await expect(counter(page)).toContainText('1 / 2')
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-element-type="text"]')).toContainText('Talk notes')
})

test('F5 does not start a show while a modal dialog is open @core-interaction', async ({
  page
}) => {
  await drawTwoFrames(page)
  await page.keyboard.press('k')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await page.keyboard.press('F5')
  await expect(controls(page)).toHaveCount(0)
  await expect(dialog).toBeVisible()
})
