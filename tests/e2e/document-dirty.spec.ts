import { readSavedDocument, encodeDocumentFixture } from './saved-document'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import {
  createEmptyDocument,
  defaultShapeStyle,
  defaultTextStyle,
  type CanvasDocument
} from '../../src/shared/canvas/element-types'

const examples = [
  'erd/shop-schema',
  'flowchart/order-fulfillment',
  'mindmap/product-strategy-2027',
  'slides/northwind-launch-deck',
  'anatomy/the-body'
]

async function openFile(page: Page, buffer: Buffer) {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Open/ }).click()
  await (
    await chooser
  ).setFiles({ name: 'sample.canvaslide', mimeType: 'application/json', buffer })
  await expect(page.locator('[data-element-id]').first()).toBeVisible()
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    )
  })
}

async function closeIsGuarded(page: Page) {
  return page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })
}

for (const example of examples) {
  test(`opening ${example} stays clean after layout`, async ({ page }) => {
    await page.goto('/')
    const buffer = await readFile(resolve('examples', `${example}.canvaslide`))
    const document: CanvasDocument = JSON.parse(buffer.toString())
    await openFile(page, buffer)
    await expect(page).toHaveTitle(`${document.name} — CanvaSlide`)
    expect(await closeIsGuarded(page)).toBe(false)
  })
}

test('measured text heights stay clean, while real edits retain history and save behavior', async ({
  page
}, testInfo) => {
  const document: CanvasDocument = JSON.parse(
    await readFile(resolve('examples/erd/shop-schema.canvaslide'), 'utf8')
  )
  // A different font or renderer can invalidate the height saved by another machine.
  document.elements['text-1']!.height = 200
  await page.goto('/')
  await openFile(page, encodeDocumentFixture(document))
  const text = page.locator('[data-element-id="text-1"]')
  await expect(text).not.toHaveCSS('min-height', '200px')
  await page.screenshot({ path: testInfo.outputPath('measured-open.png') })
  await expect(page).toHaveTitle(`${document.name} — CanvaSlide`)
  expect(await closeIsGuarded(page)).toBe(false)

  const mod = await page.evaluate(() => (/Mac/.test(navigator.userAgent) ? 'Meta' : 'Control'))
  const bounds = (await text.boundingBox())!
  await page.mouse.dblclick(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  const editor = page.locator('.canvas-text-editor')
  await expect(editor).toBeFocused()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Edited')
  await expect(page).toHaveTitle(`• ${document.name} — CanvaSlide`)
  await page.keyboard.press('Escape')
  expect(await closeIsGuarded(page)).toBe(true)
  await page.keyboard.press(`${mod}+z`)
  await expect(text).toHaveText('Shop Schema')
  await expect(page).toHaveTitle(`${document.name} — CanvaSlide`)
  expect(await closeIsGuarded(page)).toBe(false)
  await page.keyboard.press(`${mod}+Shift+z`)
  await expect(text).toContainText('Edited')
  const download = page.waitForEvent('download')
  await page.keyboard.press(`${mod}+s`)
  const savedPath = await (await download).path()
  const saved = await readFile(savedPath!)
  expect(readSavedDocument(saved).elements['text-1']).toMatchObject({
    text: expect.stringContaining('Edited')
  })
  await expect(page).toHaveTitle(`${document.name} — CanvaSlide`)
  expect(await closeIsGuarded(page)).toBe(false)
  await openFile(page, saved)
  await expect(text).toContainText('Edited')
  await expect(page).toHaveTitle(`${document.name} — CanvaSlide`)
  expect(await closeIsGuarded(page)).toBe(false)
})

function shapeDocument(name: string): Buffer {
  const document = createEmptyDocument(name)
  document.elements.box = {
    id: 'box',
    type: 'shape',
    shape: 'rectangle',
    x: 100,
    y: 100,
    width: 200,
    height: 120,
    text: 'Saved content',
    textStyle: defaultTextStyle,
    style: defaultShapeStyle
  }
  document.order = ['box']
  return encodeDocumentFixture(document)
}

test('undo to opened content skips discard when opening another file @core-interaction', async ({
  page
}, testInfo) => {
  await page.goto('/')
  await openFile(page, shapeDocument('Undo baseline'))
  const mod = await page.evaluate(() => (/Mac/.test(navigator.userAgent) ? 'Meta' : 'Control'))
  const bounds = (await page.locator('[data-element-id="box"]').boundingBox())!
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveTitle('• Undo baseline — CanvaSlide')
  const confirmations: string[] = []
  page.on('dialog', async (dialog) => {
    confirmations.push(dialog.message())
    await dialog.dismiss()
  })
  await page.getByRole('button', { name: /^Open/ }).click()
  await expect.poll(() => confirmations.length).toBe(1)
  await expect(page).toHaveTitle('• Undo baseline — CanvaSlide')
  await page.keyboard.press(`${mod}+z`)
  await expect(page).toHaveTitle('Undo baseline — CanvaSlide')
  expect(await closeIsGuarded(page)).toBe(false)
  await page.screenshot({ path: testInfo.outputPath('undo-clean.png') })
  await openFile(page, shapeDocument('Another file'))
  await expect(page).toHaveTitle('Another file — CanvaSlide')
  expect(confirmations).toHaveLength(1)
})

test('saving an intermediate undo step protects only content outside that baseline @core-interaction', async ({
  page
}, testInfo) => {
  await page.goto('/')
  await openFile(page, shapeDocument('Saved midpoint'))
  const mod = await page.evaluate(() => (/Mac/.test(navigator.userAgent) ? 'Meta' : 'Control'))
  const bounds = (await page.locator('[data-element-id="box"]').boundingBox())!
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press(`${mod}+z`)
  const download = page.waitForEvent('download')
  await page.keyboard.press(`${mod}+s`)
  const savedPath = await (await download).path()
  const saved = readSavedDocument(await readFile(savedPath!))
  expect(saved.elements.box?.x).toBe(101)
  await expect(page).toHaveTitle('Saved midpoint — CanvaSlide')
  await page.keyboard.press(`${mod}+z`)
  await expect(page).toHaveTitle('• Saved midpoint — CanvaSlide')
  expect(await closeIsGuarded(page)).toBe(true)
  const confirmations: string[] = []
  page.on('dialog', async (dialog) => {
    confirmations.push(dialog.message())
    await dialog.dismiss()
  })
  await page.getByRole('button', { name: /^Open/ }).click()
  await expect.poll(() => confirmations.length).toBe(1)
  await page.keyboard.press(`${mod}+Shift+z`)
  await expect(page).toHaveTitle('Saved midpoint — CanvaSlide')
  expect(await closeIsGuarded(page)).toBe(false)
  await page.keyboard.press(`${mod}+Shift+z`)
  await expect(page).toHaveTitle('• Saved midpoint — CanvaSlide')
  await page.getByRole('button', { name: /^New/ }).click()
  await expect.poll(() => confirmations.length).toBe(2)
  await expect(page).toHaveTitle('• Saved midpoint — CanvaSlide')
  await page.keyboard.press(`${mod}+z`)
  await expect(page).toHaveTitle('Saved midpoint — CanvaSlide')
  await page.screenshot({ path: testInfo.outputPath('saved-midpoint-clean.png') })
  await page.getByRole('button', { name: /^New/ }).click()
  await expect(page).toHaveTitle('Untitled — CanvaSlide')
  expect(confirmations).toHaveLength(2)
  expect(await closeIsGuarded(page)).toBe(false)
})
