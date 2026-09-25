import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, type Page } from '@playwright/test'

export type PresentationSurface = 'app' | 'html'
export type DeckOptions = { count?: number; tiny?: boolean; roll?: number; transitionMs?: number }

export async function openPresentation(
  page: Page,
  surface: PresentationSurface,
  options: DeckOptions = {}
) {
  const frames = Array.from({ length: options.count ?? 3 }, (_, index) => ({
    id: `f${index}`,
    type: 'frame',
    name: index === 1 ? 'A very long frame title '.repeat(10) : `Scene ${index + 1}`,
    order: index,
    x: index * 2000,
    y: index * 200,
    width: options.tiny ? 12 : 1200,
    height: options.tiny ? 8 : 800,
    transition: { roll: options.roll ?? 0 }
  }))
  await page.goto('/')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Open/ }).click()
  await (
    await chooser
  ).setFiles({
    name: 'presentation-contract.canvaslide',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        name: 'Shared presentation contract',
        elements: Object.fromEntries(frames.map((frame) => [frame.id, frame])),
        order: frames.map((frame) => frame.id),
        settings: { transitionMs: options.transitionMs ?? 120 },
        assets: {},
        resources: {}
      })
    )
  })
  await expect(page.getByTestId('frame-row')).toHaveCount(frames.length)
  if (surface === 'app') {
    await page.getByRole('button', { name: 'Slide Show', exact: true }).click()
  } else {
    await page.getByRole('button', { name: 'Share', exact: true }).click()
    await page.getByRole('button', { name: 'Export HTML', exact: true }).click()
    await page.goto(await downloadPresentation(page))
  }
  if (frames.length) {
    await expect(page.getByTestId('presentation-counter')).toContainText(`1 / ${frames.length}`)
    await page.waitForTimeout(350)
  }
}

export async function downloadPresentation(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Export presentation' })
  await expect(dialog.getByTestId('export-size')).not.toContainText('calculating')
  const pending = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export…' }).click()
  const file = join(mkdtempSync(join(tmpdir(), 'presentation-contract-')), 'deck.html')
  await (await pending).saveAs(file)
  return pathToFileURL(file).href
}

export const presentationControls = (page: Page) => page.getByTestId('presentation-controls')
export const inkStrokes = (page: Page) => page.getByTestId('presentation-ink').locator('path')

export async function revealControls(page: Page) {
  await page.mouse.move(10, page.viewportSize()!.height - 4)
  // Why: a bar still sliding in counts as visible, and hovering it then scrolls the whole viewport.
  await expect(presentationControls(page)).toBeInViewport({ ratio: 1 })
}

// Why: the controls hide after an idle pause, which a slow host can spend before the first check.
export async function holdControlsOpen(page: Page) {
  await revealControls(page)
  await presentationControls(page).hover()
}

export async function sendPointer(
  page: Page,
  type: string,
  options: Record<string, number | string | boolean>
) {
  await page.getByTestId('canvas-viewport').dispatchEvent(type, {
    pointerId: 19,
    isPrimary: true,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    pointerType: 'pen',
    clientX: 350,
    clientY: 300,
    ...options
  })
}

export async function inkEndpoints(page: Page) {
  return inkStrokes(page)
    .last()
    .evaluate((node: SVGPathElement) => {
      const matrix = node.getScreenCTM()!
      const start = node.getPointAtLength(0).matrixTransform(matrix)
      const end = node.getPointAtLength(node.getTotalLength()).matrixTransform(matrix)
      return { start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } }
    })
}
