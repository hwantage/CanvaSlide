import { readSavedDocument } from './saved-document'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { primaryModifier } from './canvas-gestures'
import { waitForEditor } from './editor-ready'

const fixture = resolve('tests/fixtures/figma-basic.fig')

async function editText(page: Page, target: Locator, value: string) {
  const id = await target.getAttribute('data-element-id')
  const text = page.locator(`[data-element-id="${id}"]`)
  const bounds = (await text.boundingBox())!
  expect(bounds.width).toBeGreaterThan(1)
  await page.mouse.dblclick(bounds.x + Math.min(bounds.width / 4, 20), bounds.y + bounds.height / 2)
  const editor = text.locator('[contenteditable="true"]')
  await expect(editor).toBeFocused()
  await editor.fill(value)
  await page.keyboard.press('Escape')
  await expect(text).toHaveText(value)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await waitForEditor(page)
})

test('imports selected Figma pages with editable layers and one undo step @webkit', async ({
  page
}) => {
  const chooser = page.waitForEvent('filechooser')
  await page.getByTestId('import-files').click()
  await (await chooser).setFiles(fixture)
  const dialog = page.getByRole('dialog', { name: 'Import Figma file' })
  await expect(dialog.getByText('Experimental', { exact: true })).toBeVisible()
  await expect(dialog).toContainText('Figma does not publish its file format')
  await expect(dialog.getByLabel(/First page/)).toBeChecked()
  await expect(dialog.getByLabel(/Second page/)).not.toBeChecked()
  await expect(dialog).not.toContainText('Internal')
  await dialog.getByLabel(/Second page/).check()
  await dialog.getByRole('button', { name: 'Import selected pages' }).click()
  await expect(dialog).toContainText('Imported 2 pages · 5 elements')
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.locator('[data-element-type="shape"]')).toHaveCount(2)
  await expect(page.locator('[data-element-type="text"]')).toContainText('Hello Figma')
  await expect(page.getByTestId('frame-row')).toHaveCount(2)
  const primary = await primaryModifier(page)
  await page.keyboard.press(`${primary}+z`)
  await expect(page.locator('[data-element-type]')).toHaveCount(0)
  await page.keyboard.press(`${primary}+Shift+z`)
  await expect(page.locator('[data-element-type="shape"]')).toHaveCount(2)
  await editText(page, page.locator('[data-element-type="text"]'), 'Edited Figma text')
  await page.keyboard.press(`${primary}+z`)
  await expect(page.locator('[data-element-type="text"]')).toHaveText('Hello Figma')
})

test('edits nested mixed-style text, undoes, saves and reopens it @webkit', async ({
  page
}, testInfo) => {
  const chooser = page.waitForEvent('filechooser')
  await page.getByTestId('import-files').click()
  await (await chooser).setFiles(resolve('tests/fixtures/figma-nested-text.fig'))
  const dialog = page.getByRole('dialog', { name: 'Import Figma file' })
  await dialog.getByRole('button', { name: 'Import selected pages' }).click()
  await expect(dialog).toContainText('2 editable text layers')
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  const texts = page.locator('[data-element-type="text"]')
  await expect(texts).toHaveCount(2)
  const target = texts.first()
  await editText(page, target, '수정한 프레임 안의 글자')
  const primary = await primaryModifier(page)
  await page.keyboard.press(`${primary}+z`)
  await expect(target).toHaveText('Nested styled text')
  await page.keyboard.press(`${primary}+Shift+z`)
  await expect(target).toHaveText('수정한 프레임 안의 글자')
  await editText(page, texts.nth(1), 'Clipped edit')
  await expect(texts.nth(1)).toHaveCSS('clip-path', 'inset(0% 50% 0% 0%)')
  const downloaded = page.waitForEvent('download')
  await page.keyboard.press(`${primary}+s`)
  const download = await downloaded
  const saved = testInfo.outputPath('edited.canvaslide')
  await download.saveAs(saved)
  const document = readSavedDocument(readFileSync(saved))
  expect(document.elements[document.order.at(-1)!]).toMatchObject({ text: 'Clipped edit' })
  await page.reload()
  await waitForEditor(page)
  const openChooser = page.waitForEvent('filechooser')
  await page.keyboard.press(`${primary}+o`)
  await (await openChooser).setFiles(saved)
  await expect(texts.first()).toHaveText('수정한 프레임 안의 글자')
  await expect(texts.nth(1)).toHaveText('Clipped edit')
  await expect(texts.nth(1)).toHaveCSS('clip-path', 'inset(0% 50% 0% 0%)')
  await editText(page, texts.first(), '다시 열어도 편집 가능')
})

test('drop supports appearance mode under the production CSP and cancellation @webkit', async ({
  page
}) => {
  await page.addInitScript(() => {
    const policy = document.createElement('meta')
    policy.httpEquiv = 'Content-Security-Policy'
    policy.content =
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self' ws:"
    document.head.append(policy)
  })
  await page.reload()
  const drop = async () => {
    await page.getByTestId('canvas-viewport').evaluate(
      (element, bytes) => {
        const data = new DataTransfer()
        data.items.add(
          new File([new Uint8Array(bytes)], 'fixture.FIG', { type: 'application/octet-stream' })
        )
        element.dispatchEvent(
          new DragEvent('drop', {
            dataTransfer: data,
            bubbles: true,
            cancelable: true,
            clientX: 200,
            clientY: 200
          })
        )
      },
      [...readFileSync(fixture)]
    )
  }
  await drop()
  const dialog = page.getByRole('dialog', { name: 'Import Figma file' })
  await expect(dialog.getByLabel(/First page/)).toBeChecked()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.locator('[data-element-type]')).toHaveCount(0)
  await drop()
  await dialog.getByLabel('Preserve appearance', { exact: false }).check()
  await dialog.getByRole('button', { name: 'Import selected pages' }).click()
  await expect(dialog).toContainText('Imported 1 pages · 3 elements')
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.locator('[data-element-type="image"]')).toHaveCount(2)
  await expect
    .poll(() =>
      page
        .locator('img[data-element-type="image"]')
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0
          )
        )
    )
    .toBe(true)
})

test('invalid Figma files report an error without modifying the canvas', async ({ page }) => {
  const chooser = page.waitForEvent('filechooser')
  await page.getByTestId('import-files').click()
  await (
    await chooser
  ).setFiles({
    name: 'invalid.fig',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('bad file')
  })
  await expect(page.getByRole('alert')).toContainText('Could not read this file')
  await expect(page.getByRole('dialog')).toContainText('Figma does not publish its file format')
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.locator('[data-element-type]')).toHaveCount(0)
})
