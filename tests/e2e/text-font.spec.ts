import { expect, test } from '@playwright/test'
import { waitForEditor } from './editor-ready'

test('the font popover stays in view as installed fonts arrive and search changes @webkit', async ({
  page
}) => {
  await page.goto('/')
  await page.evaluate(() => {
    Object.defineProperty(window, 'queryLocalFonts', {
      value: () =>
        new Promise((resolve) => {
          window.addEventListener(
            'test-fonts-ready',
            () =>
              resolve(
                Array.from({ length: 20 }, (_, i) => ({
                  family: `Review font ${String(i).padStart(2, '0')}`
                }))
              ),
            { once: true }
          )
        })
    })
  })
  await waitForEditor(page)
  await page.keyboard.press('t')
  await page.getByTestId('canvas-viewport').click({ position: { x: 400, y: 300 } })
  await page.keyboard.type('Font menu')
  await page.keyboard.press('Escape')
  await page.getByTestId('canvas-viewport').click({ position: { x: 410, y: 310 } })
  const picker = page.getByTestId('font-picker')
  // Place the control near the viewport edge to exercise both sides of the anchor.
  await picker.evaluate((element) => {
    Object.assign(element.parentElement!.style, {
      position: 'fixed',
      bottom: '120px',
      right: '20px'
    })
  })
  await picker.click()
  const popover = page.getByTestId('font-popover')
  const search = page.getByTestId('font-search')
  const anchor = (await picker.boundingBox())!
  await search.fill('Review font')
  await expect.poll(async () => (await popover.boundingBox())!.y).toBeGreaterThan(anchor.y)
  await page.evaluate(() => window.dispatchEvent(new Event('test-fonts-ready')))
  await expect(popover.getByRole('option')).toHaveCount(20)
  await expect.poll(async () => (await popover.boundingBox())!.y).toBeLessThan(anchor.y)
  await search.fill('Review font 01')
  await expect(popover.getByRole('option')).toHaveCount(1)
  await expect.poll(async () => (await popover.boundingBox())!.y).toBeGreaterThan(anchor.y)
  const bounds = (await popover.boundingBox())!
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize()!.height - 8)
})

test('the font picker lists presets, filters by search and remembers the last font', async ({
  page
}) => {
  await page.goto('/')
  await waitForEditor(page)
  await page.keyboard.press('t')
  await page.getByTestId('canvas-viewport').click({ position: { x: 400, y: 300 } })
  await page.keyboard.type('Serif me')
  await page.keyboard.press('Escape')
  const text = page.locator('[data-element-type="text"]')
  await expect(text).toHaveCount(1)
  // Why: Escape also clears the selection; reselect so the properties panel shows the font field.
  await page.getByTestId('canvas-viewport').click({ position: { x: 410, y: 310 } })
  await page.getByTestId('font-picker').click()
  const popover = page.getByTestId('font-popover')
  await expect(popover).toBeVisible()
  await expect(popover.getByRole('option')).toHaveCount(6)
  await page.getByTestId('font-search').fill('ser')
  await expect(popover.getByRole('option')).toHaveCount(1)
  await popover.getByRole('option', { name: 'Serif' }).click()
  await expect(popover).toHaveCount(0)
  await expect(text.locator('div').first()).toHaveCSS('font-family', /Georgia/)
  await expect(page.getByTestId('font-picker')).toHaveText('Serif')
  // Last-used style: the next text element starts with the same font.
  await page.keyboard.press('t')
  await page.getByTestId('canvas-viewport').click({ position: { x: 400, y: 500 } })
  await page.keyboard.type('Again')
  await page.keyboard.press('Escape')
  await expect(text.nth(1).locator('div').first()).toHaveCSS('font-family', /Georgia/)
  await page.getByTestId('canvas-viewport').click({ position: { x: 410, y: 510 } })
  await page.getByTestId('font-picker').click()
  await page.getByTestId('font-popover').getByRole('option', { name: 'Default' }).click()
  await expect(text.nth(1).locator('div').first()).not.toHaveCSS('font-family', /Georgia/)
})

test('an installed family name is applied verbatim with a sans fallback', async ({ page }) => {
  await page.goto('/')
  // Why: browsers hide the local font list behind a permission prompt, so stub the API.
  await page.evaluate(() => {
    Object.defineProperty(window, 'queryLocalFonts', {
      value: async () => [{ family: 'Zapfino' }, { family: 'Arial' }, { family: 'Arial' }]
    })
  })
  await waitForEditor(page)
  await page.keyboard.press('r')
  const canvas = page.getByTestId('canvas-viewport')
  const box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + 300, box.y + 300)
  await page.mouse.down()
  await page.mouse.move(box.x + 500, box.y + 400, { steps: 4 })
  await page.mouse.up()
  await page.getByTestId('font-picker').click()
  const popover = page.getByTestId('font-popover')
  await expect(popover).toContainText('Installed fonts')
  await expect(popover.getByRole('option', { name: 'Arial' })).toHaveCount(1)
  await popover.getByRole('option', { name: 'Zapfino' }).click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('Fancy')
  await page.keyboard.press('Escape')
  const label = page
    .locator('[data-element-type="shape"] .canvas-text-editor, [data-element-type="shape"] div div')
    .first()
  await expect(label).toHaveCSS('font-family', /^Zapfino, /)
})

test('the export dialog offers font embedding only where fonts can be read', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    Object.defineProperty(window, 'queryLocalFonts', {
      value: async () => [{ family: 'Zapfino' }]
    })
  })
  await waitForEditor(page)
  await page.keyboard.press('t')
  await page.getByTestId('canvas-viewport').click({ position: { x: 400, y: 300 } })
  await page.keyboard.type('Fancy')
  await page.keyboard.press('Escape')
  await page.getByTestId('canvas-viewport').click({ position: { x: 410, y: 310 } })
  await page.getByTestId('font-picker').click()
  await page.getByTestId('font-popover').getByRole('option', { name: 'Zapfino' }).click()
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  await page.getByRole('button', { name: 'Export HTML', exact: true }).click()
  const fonts = page.getByTestId('export-fonts')
  await expect(fonts).toContainText('Embed 1 installed font used in this document')
  // Why: the browser build cannot read font files; the desktop app enables the checkbox.
  await expect(fonts.getByRole('checkbox')).toBeDisabled()
  await expect(fonts).toContainText('available in the desktop app')
  await expect(page.getByTestId('export-size')).not.toContainText('calculating')
})
