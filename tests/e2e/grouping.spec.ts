import { expect, test, type Page } from '@playwright/test'

async function dragOnCanvas(page: Page, from: [number, number], to: [number, number]) {
  const box = (await page.getByTestId('canvas-viewport').boundingBox())!
  await page.mouse.move(box.x + from[0], box.y + from[1])
  await page.mouse.down()
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 6 })
  await page.mouse.up()
}

async function primaryModifier(page: Page): Promise<'Meta' | 'Control'> {
  return (await page.evaluate(() => /Mac/.test(navigator.userAgent))) ? 'Meta' : 'Control'
}

test('groups move as one, deep-select with the primary modifier, and ungroup again', async ({
  page
}) => {
  await page.goto('/')
  await page.keyboard.press('r')
  await dragOnCanvas(page, [100, 100], [200, 200])
  await page.keyboard.press('r')
  await dragOnCanvas(page, [300, 100], [400, 200])
  await page.keyboard.press('r')
  await dragOnCanvas(page, [600, 100], [700, 200])
  const canvas = page.getByTestId('canvas-viewport')
  const shapes = page.locator('[data-element-type="shape"]')
  const mod = await primaryModifier(page)

  await canvas.click({ position: { x: 150, y: 150 } })
  await canvas.click({ position: { x: 350, y: 150 }, modifiers: ['Shift'] })
  await page.keyboard.press(`${mod}+g`)
  await expect(page.getByRole('heading', { name: 'Group · 2 elements' })).toBeVisible()

  // A plain click on one member selects the whole group; dragging moves both.
  await canvas.click({ position: { x: 650, y: 150 } })
  await canvas.click({ position: { x: 150, y: 150 } })
  await expect(page.getByRole('heading', { name: 'Group · 2 elements' })).toBeVisible()
  await dragOnCanvas(page, [150, 150], [150, 350])
  await expect(shapes.nth(0)).toHaveCSS('top', '300px')
  await expect(shapes.nth(1)).toHaveCSS('top', '300px')
  await expect(shapes.nth(2)).toHaveCSS('top', '100px')

  // Marquee touching one member picks the group; deep select reaches a single member.
  await dragOnCanvas(page, [80, 280], [120, 320])
  await expect(page.getByRole('heading', { name: 'Group · 2 elements' })).toBeVisible()
  await canvas.click({ position: { x: 900, y: 600 } })
  await canvas.click({ position: { x: 150, y: 350 }, modifiers: [mod] })
  await expect(page.getByRole('heading', { name: 'Shape', exact: true })).toBeVisible()

  // Duplicating the group yields a second, independent group.
  await canvas.click({ position: { x: 150, y: 350 } })
  await page.keyboard.press(`${mod}+d`)
  await expect(shapes).toHaveCount(5)
  await expect(page.getByRole('heading', { name: 'Group · 2 elements' })).toBeVisible()

  // Ungroup: a click now selects one shape only.
  await page.keyboard.press(`${mod}+Shift+g`)
  await expect(page.getByRole('heading', { name: '2 elements' })).toBeVisible()
  await canvas.click({ position: { x: 900, y: 600 } })
  await canvas.click({ position: { x: 174, y: 374 } })
  await expect(page.getByRole('heading', { name: 'Shape', exact: true })).toBeVisible()
  await page.keyboard.press(`${mod}+z`)
  await page.keyboard.press(`${mod}+z`)
  await expect(shapes).toHaveCount(3)
})

test('the context menu and panel expose group and ungroup', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('r')
  await dragOnCanvas(page, [100, 100], [200, 200])
  await page.keyboard.press('r')
  await dragOnCanvas(page, [300, 100], [400, 200])
  const canvas = page.getByTestId('canvas-viewport')
  await dragOnCanvas(page, [50, 50], [450, 250])
  await canvas.click({ position: { x: 150, y: 150 }, button: 'right' })
  await page
    .getByTestId('context-menu')
    .getByRole('menuitem', { name: /^Group\s/ })
    .click()
  await expect(page.getByRole('heading', { name: 'Group · 2 elements' })).toBeVisible()
  await page.getByRole('button', { name: /^Ungroup/ }).click()
  await expect(page.getByRole('heading', { name: '2 elements' })).toBeVisible()
})
