import { expect, test } from '@playwright/test'
import { dragOnCanvas } from './canvas-gestures'
import { waitForEditor } from './editor-ready'

test('a frame smaller than the shape over it stays visible and selectable by its title', async ({
  page
}) => {
  await page.goto('/')
  await waitForEditor(page)
  await page.keyboard.press('r')
  await dragOnCanvas(page, [200, 200], [800, 700])
  await page.keyboard.press('f')
  await dragOnCanvas(page, [400, 400], [600, 550])
  const frame = page.locator('[data-element-type="frame"]')
  await expect(frame).toHaveCount(1)
  await page.keyboard.press('Escape')
  // Frame chrome stays above content in a separate screen-space overlay.
  const strip = page.locator('[data-frame-chrome-id] > div').first()
  await expect(strip).toContainText('1')
  await expect(strip).toHaveCSS('z-index', '2')
  await expect(page.getByTestId('frame-outline')).toHaveCSS('z-index', '1')
  await expect(page.getByTestId('frame-outline')).toBeVisible()
  // Clicking the title strip selects the frame even though the shape covers that area.
  await page.getByTestId('canvas-viewport').click({ position: { x: 450, y: 388 } })
  await expect(page.getByRole('heading', { name: 'Frame', exact: true })).toBeVisible()
  // Clicking inside the frame still selects the shape on top.
  await page.getByTestId('canvas-viewport').click({ position: { x: 500, y: 480 } })
  await expect(page.getByRole('heading', { name: 'Shape' })).toBeVisible()
})
