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
