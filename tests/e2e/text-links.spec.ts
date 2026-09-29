import { expect, test, type Page } from '@playwright/test'
import { waitForEditor } from './editor-ready'

// Why: the inspector's text size field has no label of its own; it sits in the "Text" row.
const textSizeField = (page: Page) =>
  page
    .locator('span', { hasText: /^Text$/ })
    .locator('xpath=..')
    .getByRole('spinbutton')

test('typed URLs and the link field link text, which the editor never follows @core-interaction', async ({
  page
}) => {
  let opened = 0
  page.context().on('page', () => {
    opened += 1
  })
  await page.goto('/')
  await waitForEditor(page)
  const viewport = page.getByTestId('canvas-viewport')
  await page.keyboard.press('t')
  await viewport.click({ position: { x: 400, y: 300 } })
  await page.keyboard.type('See https://example.com/docs.')
  await page.keyboard.press('Escape')
  const text = page.locator('[data-element-type="text"]')
  const links = text.locator('.uc-link')
  await expect(links).toHaveCount(1)
  await expect(links).toHaveAttribute('href', 'https://example.com/docs')
  await expect(links).toHaveText('https://example.com/docs')
  // Leaving the editor draws the text once, not the typed text beside the rendered runs.
  await expect(text).toHaveText('See https://example.com/docs.')

  // A click on a link in the editor selects its text and opens nothing.
  const clickLink = async () => {
    const box = (await links.boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  }
  await viewport.click({ position: { x: 900, y: 600 } })
  await clickLink()
  const field = page.getByRole('textbox', { name: 'Link', exact: true })
  await expect(field).toHaveValue('')
  await page.waitForTimeout(300)
  expect(opened).toBe(0)
  await field.fill('javascript:alert(1)')
  await field.press('Enter')
  await expect(page.getByRole('alert')).toHaveText('Enter a web address (http or https).')
  await expect(field).toHaveAttribute('aria-invalid', 'true')
  await field.fill('example.com/button')
  await field.press('Enter')
  await expect(field).toHaveValue('https://example.com/button')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(links).toHaveCount(1)
  await expect(links).toHaveAttribute('href', 'https://example.com/button')
  await expect(links).toHaveAttribute('title', 'https://example.com/button')
  await expect(links).toHaveText('See https://example.com/docs.')

  // Undo restores the typed URL as the only link; the field follows the document.
  await viewport.click({ position: { x: 900, y: 600 } })
  // The primary modifier follows the emulated platform; the other press is ignored.
  await page.keyboard.press('Meta+z')
  await page.keyboard.press('Control+z')
  await expect(links).toHaveAttribute('href', 'https://example.com/docs')
  await clickLink()
  await expect(field).toHaveValue('')
  await page.waitForTimeout(300)
  expect(opened).toBe(0)
  await page.keyboard.press('Meta+Shift+z')
  await page.keyboard.press('Control+Shift+z')
  await expect(field).toHaveValue('https://example.com/button')
  // Clearing the field removes the link.
  await field.fill('')
  await field.press('Enter')
  await expect(field).toHaveValue('')
  await expect(links).toHaveAttribute('href', 'https://example.com/docs')

  // A link typed and left by clicking the canvas is kept, even though the field unmounts.
  await field.fill('example.com/kept')
  await viewport.click({ position: { x: 900, y: 600 } })
  await expect(field).toHaveCount(0)
  await expect(links).toHaveAttribute('href', 'https://example.com/kept')
})

test('a text keeps its stored height in step with its style after editing ends @core-interaction', async ({
  page
}) => {
  await page.goto('/')
  await waitForEditor(page)
  const viewport = page.getByTestId('canvas-viewport')
  await page.keyboard.press('t')
  await viewport.click({ position: { x: 400, y: 300 } })
  await page.keyboard.type('Hello canvas')
  await page.keyboard.press('Escape')
  const text = page.locator('[data-element-type="text"]')
  const storedHeight = async () =>
    Number.parseFloat(await text.evaluate((node) => (node as HTMLElement).style.minHeight))
  const before = await storedHeight()
  await viewport.click({ position: { x: 410, y: 310 } })
  await textSizeField(page).fill('120')
  await expect.poll(storedHeight).toBeGreaterThan(120)
  expect(before).toBeLessThan(60)
})
