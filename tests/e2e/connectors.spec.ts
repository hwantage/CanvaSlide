import { expect, test } from '@playwright/test'
import { dragOnCanvas } from './canvas-gestures'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('r')
  await dragOnCanvas(page, [100, 100], [250, 200])
  await page.keyboard.press('o')
  await dragOnCanvas(page, [500, 300], [650, 400])
  await page.keyboard.press('Escape')
})

test('draws an arrow between two shapes that follows them when they move', async ({ page }) => {
  await page.keyboard.press('l')
  await expect(page.getByTestId('connector-flyout')).toBeVisible()
  const box = await page.getByTestId('canvas-viewport').boundingBox()
  if (!box) {
    throw new Error('no canvas')
  }
  // Hovering a shape with the connector tool shows its four ports before any click.
  await page.mouse.move(box.x + 240, box.y + 150)
  await expect(page.getByTestId('anchor-dot')).toHaveCount(3)
  await expect(page.getByTestId('anchor-active')).toHaveCount(1)
  await page.mouse.move(box.x + 400, box.y + 600)
  await expect(page.getByTestId('anchor-active')).toHaveCount(0)
  await page.mouse.move(box.x + 240, box.y + 150)
  await page.mouse.down()
  await page.mouse.move(box.x + 505, box.y + 350, { steps: 8 })
  await expect(page.getByTestId('anchor-active')).toBeVisible()
  await page.mouse.up()
  const connector = page.locator('[data-element-type="connector"]')
  await expect(connector).toHaveCount(1)
  const path = connector.locator('[data-testid="connector-path"]')
  // Start snapped to the rectangle's right anchor (250,150), end to the ellipse's left (500,350).
  await expect(path).toHaveAttribute('d', 'M 250 150 L 500 350')
  await expect(path).toHaveAttribute('marker-end', /url/)
  // Moving the ellipse drags the attached end along.
  await dragOnCanvas(page, [575, 350], [575, 450])
  await expect(path).toHaveAttribute('d', 'M 250 150 L 500 450')
  // Both end handles show for a selected connector; dragging one to empty space detaches it.
  await page.getByTestId('canvas-viewport').click({ position: { x: 375, y: 300 } })
  await expect(page.getByTestId('connector-end-handle')).toBeVisible()
  const handle = page.getByTestId('connector-end-handle')
  const hb = await handle.boundingBox()
  if (!hb) {
    throw new Error('no handle')
  }
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 400, box.y + 600, { steps: 8 })
  await page.mouse.up()
  // The start was dropped on the rectangle's right port, so it stays pinned there.
  await expect(path).toHaveAttribute('d', 'M 250 150 L 400 600')
})

test('route and arrowheads can be changed from the panel; label edits inline', async ({ page }) => {
  await page.keyboard.press('l')
  await page.getByRole('button', { name: 'Curved' }).click()
  await page.getByRole('button', { name: 'Double arrow' }).click()
  await dragOnCanvas(page, [240, 150], [505, 350])
  const path = page.locator('[data-testid="connector-path"]')
  await expect(path).toHaveAttribute('d', /^M 250 150 C /)
  await expect(path).toHaveAttribute('marker-start', /url/)
  await page.locator('aside').getByRole('button', { name: 'Elbow' }).click()
  await expect(path).toHaveAttribute('d', 'M 250 150 L 375 150 L 375 350 L 500 350')
  await page.locator('aside').getByRole('button', { name: 'Line', exact: true }).click()
  await expect(path).not.toHaveAttribute('marker-end', /url/)
  await page.getByTestId('canvas-viewport').dblclick({ position: { x: 375, y: 250 } })
  await page.keyboard.type('yes')
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-element-type="connector"]')).toContainText('yes')
})

test('an aborted click with the connector tool leaves nothing behind', async ({ page }) => {
  await page.keyboard.press('l')
  await page.getByTestId('canvas-viewport').click({ position: { x: 400, y: 500 } })
  await expect(page.locator('[data-element-type="connector"]')).toHaveCount(0)
  await page.keyboard.press('Meta+z')
  await page.keyboard.press('Control+z')
  await expect(page.locator('[data-element-type="shape"]')).toHaveCount(1)
})

test('dropping on a port pins it; dropping on the body picks the facing port', async ({ page }) => {
  await page.keyboard.press('l')
  // Rectangle body (auto) → ellipse TOP port (575,300), even though the rectangle is to the left.
  await dragOnCanvas(page, [175, 150], [575, 302])
  const path = page.locator('[data-testid="connector-path"]')
  await expect(path).toHaveAttribute('d', 'M 250 150 L 575 300')
  // Moving the ellipse far to the left keeps the pinned top port; the auto start flips to bottom.
  await dragOnCanvas(page, [575, 350], [175, 650])
  await expect(path).toHaveAttribute('d', 'M 175 200 L 175 600')
})
