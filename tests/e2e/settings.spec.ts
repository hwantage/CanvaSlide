import { expect, test, type Page } from '@playwright/test'

async function dragOnCanvas(page: Page, from: [number, number], to: [number, number]) {
  const box = await page.getByTestId('canvas-viewport').boundingBox()
  if (!box) {
    throw new Error('canvas not laid out')
  }
  await page.mouse.move(box.x + from[0], box.y + from[1])
  await page.mouse.down()
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 6 })
  await page.mouse.up()
}

test('settings dialog controls transition, background and frame border', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('f')
  await dragOnCanvas(page, [100, 100], [400, 300])
  // Deselect: a selected frame always shows a solid highlight outline.
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /^Settings/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await expect(dialog).toBeVisible()

  await dialog.getByLabel('Transition duration').fill('2500')
  await expect(dialog.getByTestId('transition-value')).toHaveText('2.5s')

  const background = page.getByTestId('canvas-background')
  await expect(background).toHaveAttribute('data-background', 'dots')
  await dialog.getByRole('radio', { name: 'Plain' }).click()
  await expect(background).toHaveAttribute('data-background', 'plain')
  await expect(background).toHaveCSS('background-image', 'none')
  await dialog.getByRole('radio', { name: 'Grid lines' }).click()
  await expect(background).toHaveAttribute('data-background', 'grid')

  const outline = page.getByTestId('frame-outline').first()
  await dialog.getByRole('radio', { name: 'Dashed' }).click()
  await expect(outline).toHaveCSS('border-top-style', 'dashed')
  await dialog.getByRole('radio', { name: 'Hidden' }).click()
  await expect(outline).toHaveCSS('border-top-width', '0px')

  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(dialog).toHaveCount(0)
})

test('blocks canvas shortcuts while the settings dialog is open', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('r')
  await dragOnCanvas(page, [300, 300], [500, 420])
  const shapes = page.locator('[data-element-type="shape"]')
  await expect(shapes).toHaveCount(1)
  await page.getByRole('button', { name: /^Settings/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Delete')
  await page.keyboard.press('Backspace')
  await expect(shapes).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(shapes).toHaveCount(1)
})

test('theme preference overrides the OS and survives a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-theme', 'dark')

  await page.getByRole('button', { name: /^Settings/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await dialog.getByRole('radio', { name: 'Light' }).click()
  await expect(dialog.getByRole('radio', { name: 'Light' })).toBeChecked()
  await expect(html).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)')

  await dialog.getByRole('radio', { name: 'Dark' }).click()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(24, 24, 27)')

  // A forced theme must stay put across restarts, and `system` must follow the OS again.
  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(24, 24, 27)')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(html).toHaveAttribute('data-theme', 'dark')

  await page.getByRole('button', { name: /^Settings/ }).click()
  await dialog.getByRole('radio', { name: 'System' }).click()
  await expect(dialog.getByRole('radio', { name: 'System' })).toBeChecked()
  await expect(html).toHaveAttribute('data-theme', 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(html).toHaveAttribute('data-theme', 'dark')
})

test('dark mode darkens the canvas, grid and frame sheet together', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await page.keyboard.press('f')
  await dragOnCanvas(page, [100, 100], [400, 300])
  await page.keyboard.press('Escape')

  const background = page.getByTestId('canvas-background')
  const frame = page.locator('[data-element-type="frame"]')
  const outline = page.getByTestId('frame-outline')
  await expect(background).toHaveCSS('background-color', 'rgb(247, 247, 248)')
  await expect(background).toHaveCSS('background-image', /rgb\(212, 212, 216\)/)
  await expect(frame).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.6)')
  await expect(outline).toHaveCSS('border-color', 'rgb(161, 161, 170)')

  await page.getByRole('button', { name: /^Settings/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await dialog.getByRole('radio', { name: 'Dark' }).click()
  await dialog.getByRole('button', { name: 'Done' }).click()

  await expect(background).toHaveCSS('background-color', 'rgb(18, 18, 21)')
  await expect(background).toHaveCSS('background-image', /rgb\(47, 47, 53\)/)
  // A white sheet would glare on the dark board: the frame becomes a dark slab with a crisper edge.
  await expect(frame).toHaveCSS('background-color', 'rgb(30, 31, 40)')
  await expect(outline).toHaveCSS('border-color', 'rgb(139, 139, 149)')
})
