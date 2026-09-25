import { expect, test } from '@playwright/test'
import { dragOnCanvas, primaryModifier } from './canvas-gestures'
import { waitForEditor } from './editor-ready'

test('shift or the primary modifier toggles objects and frames in the selection', async ({
  page
}) => {
  await page.goto('/')
  await waitForEditor(page)
  await page.keyboard.press('r')
  await dragOnCanvas(page, [100, 100], [200, 200])
  await page.keyboard.press('r')
  await dragOnCanvas(page, [300, 100], [400, 200])
  await page.keyboard.press('f')
  await dragOnCanvas(page, [500, 300], [800, 500])
  const canvas = page.getByTestId('canvas-viewport')
  const mod = await primaryModifier(page)
  const count = page.getByRole('heading', { name: /elements/ })

  await canvas.click({ position: { x: 150, y: 150 } })
  await canvas.click({ position: { x: 350, y: 150 }, modifiers: [mod] })
  await expect(count).toHaveText('2 elements')
  // A modifier-click on the frame's empty interior adds the frame; again removes it.
  await canvas.click({ position: { x: 650, y: 400 }, modifiers: ['Shift'] })
  await expect(count).toHaveText('3 elements')
  await canvas.click({ position: { x: 650, y: 400 }, modifiers: ['Shift'] })
  await expect(count).toHaveText('2 elements')
  // Toggling a shape off with the primary modifier.
  await canvas.click({ position: { x: 150, y: 150 }, modifiers: [mod] })
  await expect(page.getByRole('heading', { name: 'Shape', exact: true })).toBeVisible()
  // A plain click still replaces the selection.
  await canvas.click({ position: { x: 150, y: 150 } })
  await canvas.click({ position: { x: 350, y: 150 } })
  await expect(count).toHaveCount(0)
})
