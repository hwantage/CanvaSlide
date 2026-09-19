import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test, type Locator, type Page } from '@playwright/test'

async function openDistantFrames(page: Page) {
  const frames = [-50_000, 1000, 95_000].map((x, index) => ({
    id: `frame-${index}`,
    type: 'frame',
    name: ['Left', 'Middle', 'Right'][index],
    order: index,
    x,
    y: -10_000,
    width: 24_000,
    height: 13_500
  }))
  const document = {
    version: 2,
    name: 'Distant frames',
    elements: {
      ...Object.fromEntries(frames.map((frame) => [frame.id, frame])),
      background: {
        id: 'background',
        type: 'shape',
        shape: 'rectangle',
        x: -72_000,
        y: -60_000,
        width: 800_000,
        height: 160_000,
        text: '',
        textStyle: { color: '#000000', fontSize: 16, align: 'left', bold: false },
        style: { fill: '#ffffff', stroke: 'none', strokeWidth: 0, cornerRadius: 0 }
      }
    },
    order: ['background', ...frames.map((frame) => frame.id)],
    settings: { transitionMs: 350, background: 'dots', frameBorder: 'solid' },
    assets: {},
    camera: { x: 0, y: 0, zoom: 1 }
  }
  await page.goto('/')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Open/ }).click()
  await (
    await chooser
  ).setFiles({
    name: 'distant.canvaslide',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(document))
  })
  await expect(page.getByTestId('frame-row')).toHaveCount(3)
}

async function expectContained(targets: Locator, count = 3) {
  await expect(targets).toHaveCount(count)
  await expect
    .poll(() =>
      targets.evaluateAll((elements) => {
        const rects = elements.map((element) => element.getBoundingClientRect())
        const left = Math.min(...rects.map((rect) => rect.left))
        const right = Math.max(...rects.map((rect) => rect.right))
        const top = Math.min(...rects.map((rect) => rect.top))
        const bottom = Math.max(...rects.map((rect) => rect.bottom))
        return (
          left > 0 &&
          right < innerWidth &&
          top > 0 &&
          bottom < innerHeight &&
          Math.abs((left + right) / 2 - innerWidth / 2) < 2 &&
          Math.abs((top + bottom) / 2 - innerHeight / 2) < 2 &&
          Math.max((right - left) / innerWidth, (bottom - top) / innerHeight) > 0.8
        )
      })
    )
    .toBe(true)
}

test('overview fits distant frames after resize and supports navigation and exit', async ({
  page
}) => {
  await openDistantFrames(page)
  const world = page.getByTestId('world-layer')
  const editorTransform = await world.evaluate((element) => element.style.transform)
  await page.getByRole('button', { name: 'Slide Show', exact: true }).click()
  const overview = page.getByRole('button', { name: 'Overview (O)' })
  await overview.click()
  const targets = page.getByTestId('overview-frame')
  for (const size of [
    { width: 1400, height: 900 },
    { width: 800, height: 500 },
    { width: 900, height: 1400 }
  ]) {
    await page.setViewportSize(size)
    await expectContained(targets)
  }
  await page.setViewportSize({ width: 1400, height: 900 })
  await expectContained(targets)
  await targets.nth(2).click()
  const counter = page.getByTestId('presentation-counter')
  await expect(counter).toContainText('3 / 3')
  await expect(targets).toHaveCount(0)
  await page.getByRole('button', { name: 'Previous frame (←)' }).click()
  await expect(counter).toContainText('2 / 3')
  await overview.click()
  await expectContained(targets)
  await overview.click()
  await expect(targets).toHaveCount(0)
  await expect(counter).toContainText('2 / 3')
  await overview.click()
  await expectContained(targets)
  await targets.first().click()
  await expect(counter).toContainText('1 / 3')
  await page.getByRole('button', { name: 'Next frame (→)' }).click()
  await expect(counter).toContainText('2 / 3')
  await page.getByRole('button', { name: 'Exit presentation (Esc)' }).click()
  await expect(counter).toHaveCount(0)
  await expect
    .poll(() => world.evaluate((element) => element.style.transform))
    .toBe(editorTransform)
})

test('swing overview fits the outermost frames instead of magnifying only the center', async ({
  page
}) => {
  await page.goto('/')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Open/ }).click()
  await (await chooser).setFiles(resolve('examples/swing/the-swing.canvaslide'))
  await expect(page.getByTestId('frame-row')).toHaveCount(12)
  await page.getByRole('button', { name: 'Slide Show', exact: true }).click()
  await page.getByRole('button', { name: 'Overview (O)' }).click()
  await expectContained(page.getByTestId('overview-frame'), 12)
  await page.setViewportSize({ width: 800, height: 500 })
  await expectContained(page.getByTestId('overview-frame'), 12)
})

test('exported overview preserves a sub-minimum fit through navigation and resize', async ({
  page
}) => {
  await openDistantFrames(page)
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  await page.getByRole('button', { name: 'Export HTML', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Export presentation' })
  await expect(dialog.getByTestId('export-size')).not.toContainText('calculating')
  const pending = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export…' }).click()
  const file = join(mkdtempSync(join(tmpdir(), 'overview-fit-')), 'deck.html')
  await (await pending).saveAs(file)
  const player = await page.context().newPage()
  await player.goto(pathToFileURL(file).href)
  const overview = player.getByRole('button', { name: 'Overview (O)' })
  await overview.click()
  const frames = player.locator('.uc-frame')
  await expectContained(frames)
  await player.setViewportSize({ width: 800, height: 500 })
  await expectContained(frames)
  await frames.nth(2).click()
  await expect(player.getByTestId('presentation-counter')).toContainText('3 / 3')
  await expect(player.locator('.uc-overview')).toHaveCount(0)
  await player.keyboard.press('ArrowLeft')
  await expect(player.getByTestId('presentation-counter')).toContainText('2 / 3')
  await overview.click()
  await expectContained(frames)
  await frames.first().click()
  await expect(player.getByTestId('presentation-counter')).toContainText('1 / 3')
  await player.close()
})
