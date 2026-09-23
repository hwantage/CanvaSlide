import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test } from '@playwright/test'
import { dragOnCanvas, primaryModifier } from './canvas-gestures'

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
  // The label sits in the lower middle of the stroke's centreline, clear of the slanted edges.
  const label = triangle.locator('> div')
  await expect(label).toHaveCSS('left', '40.5px')
  await expect(label).toHaveCSS('top', '50px')
  await expect(label).toHaveCSS('width', '79px')

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
  await expect(exportedLabel).toHaveCSS('left', '40.5px')
  await expect(exportedLabel).toHaveCSS('top', '50px')
  await expect(exportedLabel).toHaveCSS('width', '79px')
})

test('a line on a turning triangle keeps its port instead of jumping to another side', async ({
  page
}) => {
  await page.goto('/')
  await page.keyboard.press('r')
  await dragOnCanvas(page, [100, 300], [260, 400])
  await page.getByRole('button', { name: 'Triangle', exact: true }).click()
  // 200×200 box centred on (600, 350); its left port sits on the slant at (550, 350).
  await dragOnCanvas(page, [500, 250], [700, 450])
  // Dropped on the body rather than on a port, the end takes the side facing the rectangle.
  await page.keyboard.press('l')
  await dragOnCanvas(page, [180, 300], [575, 360])
  const path = page.locator('[data-testid="connector-path"]')
  await expect(path).toHaveAttribute('data-route', 'M 180 300 L 550 350')
  await page.keyboard.press('Escape')

  // Turning by the handle carries the line around on the same port.
  await page.getByTestId('canvas-viewport').click({ position: { x: 600, y: 400 } })
  const viewport = await page.getByTestId('canvas-viewport').boundingBox()
  const handle = await page.getByTestId('rotation-handle').boundingBox()
  if (!viewport || !handle) {
    throw new Error('no rotation handle')
  }
  await page.keyboard.down('Shift')
  await dragOnCanvas(
    page,
    [handle.x + handle.width / 2 - viewport.x, handle.y + handle.height / 2 - viewport.y],
    [760, 350]
  )
  await page.keyboard.up('Shift')
  await expect(path).toHaveAttribute('data-route', 'M 180 300 L 600 300')
  const modifier = await primaryModifier(page)
  await page.keyboard.press(`${modifier}+z`)
  await expect(path).toHaveAttribute('data-route', 'M 180 300 L 550 350')

  // So does a typed angle; left to face the rectangle, the end would jump to the base at 60°.
  const rotation = page.getByRole('spinbutton', { name: 'Rotation' })
  await rotation.fill('60')
  await rotation.press('Enter')
  await expect(path).toHaveAttribute('data-route', /^M 180 300 L 575 306\.69/)
})
