import { readSavedDocument } from './saved-document'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { expect, test, type Locator, type Page } from '@playwright/test'
import type { CanvasDocument } from '../../src/shared/canvas/element-types'
import { dragOnCanvas, primaryModifier } from './canvas-gestures'
import { waitForEditor } from './editor-ready'

const colours = {
  light: { text: 'rgb(24, 24, 27)', background: 'rgb(247, 247, 248)' },
  dark: { text: 'rgb(250, 250, 250)', background: 'rgb(18, 18, 21)' }
}

async function expectLabelTheme(label: Locator, theme: 'light' | 'dark') {
  await expect(label).toHaveCSS('color', colours[theme].text)
  await expect(label.locator('..')).toHaveCSS('background-color', colours[theme].background)
}

async function selectTheme(page: Page, theme: 'Light' | 'Dark') {
  await page.getByRole('button', { name: /^Settings/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await dialog
    .getByRole('radiogroup', { name: 'Theme preference' })
    .getByRole('radio', { name: theme })
    .click()
  await dialog.getByRole('button', { name: 'Done' }).click()
}

for (const initialTheme of ['light', 'dark'] as const) {
  test(`connector labels follow ${initialTheme} and theme changes while editing @webkit`, async ({
    page
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: initialTheme })
    await page.goto('/')
    await waitForEditor(page)
    await page.keyboard.press('r')
    await dragOnCanvas(page, [100, 100], [250, 200])
    await page.keyboard.press('o')
    await dragOnCanvas(page, [500, 300], [650, 400])
    await page.keyboard.press('l')
    await dragOnCanvas(page, [250, 150], [500, 350])
    await page.keyboard.press('Enter')
    const editor = page.locator('[data-element-type="connector"] [contenteditable="true"]')
    await expect(editor).toBeFocused()
    await page.keyboard.type('Readable label')
    await page.screenshot({
      path: testInfo.outputPath(`connector-label-${initialTheme}-editing.png`)
    })
    await expectLabelTheme(editor, initialTheme)

    const nextTheme = initialTheme === 'light' ? 'dark' : 'light'
    await page.emulateMedia({ colorScheme: nextTheme })
    await expectLabelTheme(editor, nextTheme)
    await expect(editor).toBeFocused()
    await page.keyboard.type(' after switching')
    await page.keyboard.press('Escape')
    const label = page
      .locator('[data-element-type="connector"]')
      .getByText('Readable label after switching')
    await expectLabelTheme(label, nextTheme)

    await selectTheme(page, initialTheme === 'light' ? 'Light' : 'Dark')
    await expectLabelTheme(label, initialTheme)
    const mod = await primaryModifier(page)
    await page.keyboard.press(`${mod}+z`)
    await expect(label).toHaveCount(0)
    await page.keyboard.press(`${mod}+Shift+z`)
    await expectLabelTheme(label, initialTheme)
  })
}

test('saved labels retain their colours and export from dark mode to the light player @webkit', async ({
  page
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await waitForEditor(page)
  await page.keyboard.press('f')
  await dragOnCanvas(page, [100, 100], [700, 500])
  await page.keyboard.press('l')
  await dragOnCanvas(page, [200, 200], [600, 200])
  await page.keyboard.press('Enter')
  await page.keyboard.type('Default label')
  await page.keyboard.press('Escape')
  await page.keyboard.press('l')
  await dragOnCanvas(page, [200, 350], [600, 350])
  await page.keyboard.press('Enter')
  await page.keyboard.type('Custom label')
  await page.keyboard.press('Escape')
  await page.getByTestId('canvas-viewport').click({ position: { x: 300, y: 350 } })
  // The shared text-style panel already exposes connector label colours.
  await page.locator('aside').getByRole('button', { name: 'Text', exact: true }).click()
  await page.getByTestId('color-hex').fill('#c026d3')
  await page.getByTestId('color-hex').press('Enter')
  await page.keyboard.press('Escape')
  const custom = page.locator('[data-element-type="connector"]').getByText('Custom label')
  await expect(custom).toHaveCSS('color', 'rgb(192, 38, 211)')
  const mod = await primaryModifier(page)
  await page.keyboard.press(`${mod}+z`)
  await expectLabelTheme(custom, 'dark')
  await page.keyboard.press(`${mod}+Shift+z`)
  await expect(custom).toHaveCSS('color', 'rgb(192, 38, 211)')

  const savedDownload = page.waitForEvent('download')
  await page.keyboard.press(`${mod}+s`)
  const savedPath = await (await savedDownload).path()
  const saved = await readFile(savedPath!)
  const document: CanvasDocument = readSavedDocument(saved)
  expect(
    Object.values(document.elements)
      .filter((element) => element.type === 'connector')
      .map((element) => element.textStyle.color)
  ).toEqual(['#18181b', '#c026d3'])

  await page.reload()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Open/ }).click()
  await (
    await chooser
  ).setFiles({ name: 'labels.canvaslide', mimeType: 'application/json', buffer: saved })
  const label = page.locator('[data-element-type="connector"]').getByText('Default label')
  await expectLabelTheme(label, 'dark')
  await selectTheme(page, 'Light')
  await expectLabelTheme(label, 'light')
  await expect(custom).toHaveCSS('color', 'rgb(192, 38, 211)')
  await selectTheme(page, 'Dark')
  await expectLabelTheme(label, 'dark')
  await expect(page).toHaveTitle(`${document.name} — CanvaSlide`)

  await page.getByRole('button', { name: 'Share', exact: true }).click()
  await page.getByRole('button', { name: 'Export HTML', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Export presentation' })
  await expect(dialog.getByTestId('export-size')).not.toContainText('calculating')
  const exportDownload = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export…' }).click()
  const file = testInfo.outputPath('labels.html')
  await (await exportDownload).saveAs(file)
  const player = await page.context().newPage()
  await player.goto(pathToFileURL(file).href)
  await expect(player.getByTestId('presentation-counter')).toContainText('1 / 1')
  const exportedDefault = player.locator('.uc-connector-label', { hasText: 'Default label' })
  await expect(exportedDefault).toHaveCSS('color', colours.light.text)
  await expect(exportedDefault).toHaveCSS('background-color', colours.light.background)
  await expect(player.locator('.uc-connector-label', { hasText: 'Custom label' })).toHaveCSS(
    'color',
    'rgb(192, 38, 211)'
  )
  await player.screenshot({ path: testInfo.outputPath('connector-label-export.png') })
})
