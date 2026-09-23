import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test } from '@playwright/test'
import { dragOnCanvas } from './canvas-gestures'

test('draws a triangle whose label, ports, panel fields and HTML export follow its outline', async ({
  page
}) => {
  await page.goto('/')
  await page.keyboard.press('f')
  await dragOnCanvas(page, [50, 200], [750, 500])
  await page.keyboard.press('r')
  await dragOnCanvas(page, [100, 300], [250, 400])
  await page.getByRole('button', { name: 'Triangle', exact: true }).click()
  await dragOnCanvas(page, [500, 300], [660, 400])

  const triangle = page.locator('[data-element-type="shape"]').nth(1)
  // A 2px stroke is inset by half so the outline stays inside the 160×100 box.
  const outline = '80,1 159,99 1,99'
  await expect(triangle.locator('polygon')).toHaveAttribute('points', outline)
  await page.getByTestId('canvas-viewport').dblclick({ position: { x: 580, y: 375 } })
  await page.keyboard.type('Tri')
  await page.keyboard.press('Escape')
  await expect(triangle).toContainText('Tri')
  // The label sits in the triangle's lower middle, clear of the slanted edges.
  const label = triangle.locator('> div')
  await expect(label).toHaveCSS('left', '40px')
  await expect(label).toHaveCSS('top', '50px')
  await expect(label).toHaveCSS('width', '80px')

  // Only a rectangle draws a corner radius, so the field shows for it alone.
  const radius = page.locator('aside').getByText('Radius', { exact: true })
  await page.getByTestId('canvas-viewport').click({ position: { x: 580, y: 380 } })
  await expect(page.locator('aside').getByText('Fill', { exact: true })).toBeVisible()
  await expect(radius).toHaveCount(0)
  await page.getByTestId('canvas-viewport').click({ position: { x: 175, y: 350 } })
  await expect(radius).toBeVisible()
  await page.keyboard.press('Escape')

  // Dropping a connector on the triangle's left port lands on the slanted edge, not the box side.
  await page.keyboard.press('l')
  await dragOnCanvas(page, [200, 350], [541, 351])
  const path = page.locator('[data-testid="connector-path"]')
  await expect(path).toHaveAttribute('data-route', 'M 250 350 L 540 350')
  await page.keyboard.press('Escape')
  // The empty corner above the slant is not part of the triangle, so the end stays free there.
  await page.keyboard.press('l')
  await dragOnCanvas(page, [200, 330], [506, 306])
  await expect(path.nth(1)).toHaveAttribute('data-route', 'M 250 350 L 506 306')
  await page.keyboard.press('Escape')
  // All three corners and all three side midpoints are ports; a base corner pins like any other.
  await page.keyboard.press('l')
  const viewport = await page.getByTestId('canvas-viewport').boundingBox()
  if (!viewport) {
    throw new Error('no canvas')
  }
  await page.mouse.move(viewport.x + 580, viewport.y + 370)
  await expect(page.getByTestId('anchor-dot')).toHaveCount(5)
  await expect(page.getByTestId('anchor-active')).toHaveCount(1)
  await dragOnCanvas(page, [200, 380], [501, 399])
  await expect(path.nth(2)).toHaveAttribute('data-route', 'M 250 350 L 500 400')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Share', exact: true }).click()
  await page.getByRole('button', { name: 'Export HTML', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Export presentation' })
  await expect(dialog.getByTestId('export-size')).not.toContainText('calculating', {
    timeout: 10_000
  })
  const downloadPromise = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export…' }).click()
  const file = join(mkdtempSync(join(tmpdir(), 'uc-triangle-')), 'deck.html')
  await (await downloadPromise).saveAs(file)

  const player = await page.context().newPage()
  await player.goto(pathToFileURL(file).href)
  const exported = player.locator('.uc-shape').nth(1)
  await expect(exported.locator('polygon')).toHaveAttribute('points', outline)
  const exportedLabel = exported.locator('.uc-shape-label')
  await expect(exportedLabel).toContainText('Tri')
  await expect(exportedLabel).toHaveCSS('left', '40px')
  await expect(exportedLabel).toHaveCSS('top', '50px')
  await expect(exportedLabel).toHaveCSS('width', '80px')
})
