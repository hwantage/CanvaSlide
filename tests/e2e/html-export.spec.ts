import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test } from '@playwright/test'
import { dragOnCanvas } from './canvas-gestures'
import { waitForEditor } from './editor-ready'

test('exports a self-contained HTML player that presents the frames @webkit', async ({
  page,
  browserName
}) => {
  await page.goto('/')
  await waitForEditor(page)
  await page.keyboard.press('f')
  await dragOnCanvas(page, [100, 150], [400, 320])
  await page.keyboard.press('r')
  await dragOnCanvas(page, [140, 180], [260, 260])
  await page.keyboard.press('f')
  await dragOnCanvas(page, [700, 500], [1000, 800])
  await page.keyboard.press('t')
  await page.getByTestId('canvas-viewport').click({ position: { x: 720, y: 520 } })
  await page.keyboard.type('Exported text')
  await page.keyboard.press('Escape')
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 200
    canvas.height = 100
    canvas.getContext('2d')?.fillRect(0, 0, 200, 100)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    const data = new DataTransfer()
    data.items.add(new File([blob as Blob], 'shot.png', { type: 'image/png' }))
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  })
  await expect(page.locator('[data-element-type="image"]')).toHaveCount(1)

  await page.getByRole('button', { name: 'Share', exact: true }).click()
  await page.getByRole('button', { name: 'Export HTML', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Export presentation' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('export-size')).not.toContainText('calculating', {
    timeout: 10_000
  })
  const downloadPromise = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export…' }).click()
  const download = await downloadPromise
  const dir = mkdtempSync(join(tmpdir(), 'uc-export-'))
  const file = join(dir, 'deck.html')
  await download.saveAs(file)
  await expect(dialog).toHaveCount(0)

  const player = await page.context().newPage()
  await player.goto(pathToFileURL(file).href)
  const counter = player.getByTestId('presentation-counter')
  await expect(counter).toContainText('1 / 2')
  await expect(player.locator('.uc-shape')).toHaveCount(1)
  await expect(player.locator('.uc-img')).toHaveCount(1)
  await expect(player.locator('.uc-text', { hasText: 'Exported text' })).toHaveCount(1)
  const world = player.getByTestId('world-layer')
  // The player makes the same per-engine text-metrics choice as the editor.
  await expect(world.locator('> div')).toHaveCSS(
    'font-optical-sizing',
    browserName === 'webkit' ? 'none' : 'auto'
  )
  const before = await world.evaluate((el) => el.style.transform)
  await player.keyboard.press('ArrowRight')
  await expect(counter).toContainText('2 / 2')
  await expect.poll(() => world.evaluate((el) => el.style.transform)).not.toBe(before)
  await player.getByRole('button', { name: 'Overview (O)' }).click()
  await expect(player.locator('.uc-overview')).toHaveCount(1)
  // Smaller frames stack above bigger ones so a wrapping frame can't swallow their clicks.
  const stacking = await player
    .locator('.uc-frame')
    .evaluateAll((nodes) => nodes.map((node) => Number(getComputedStyle(node).zIndex)))
  expect(stacking[0]).toBeGreaterThan(stacking[1] as number)
  await player.locator('.uc-frame').first().click()
  await expect(counter).toContainText('1 / 2')
  await expect(player.locator('.uc-overview')).toHaveCount(0)
  // No network dependencies in the exported page.
  const html = await player.content()
  expect(html).not.toMatch(/<(script|link)[^>]+(src|href)="https?:/)
})
