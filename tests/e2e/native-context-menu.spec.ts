import { readFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from '@playwright/test'

async function openDocument(page: Page) {
  await page.goto('/')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Open/ }).click()
  await (await chooser).setFiles('examples/slides/northwind-launch-deck.canvaslide')
  await expect(page.getByTestId('frame-row')).toHaveCount(7)
  await expect(page).toHaveTitle('Northwind Launch Deck — CanvaSlide')
  // Headless engines omit native menus; observe cancellation of real right-click events instead.
  await page.evaluate(() => {
    window.addEventListener(
      'contextmenu',
      (event) => {
        setTimeout(() => {
          document.documentElement.dataset.nativeContextMenu = event.defaultPrevented
            ? 'blocked'
            : 'allowed'
        }, 0)
      },
      true
    )
  })
}

async function rightClick(page: Page, target: Locator, expected: 'blocked' | 'allowed') {
  await page.locator('html').evaluate((el) => el.removeAttribute('data-native-context-menu'))
  await target.click({ button: 'right' })
  await expect(page.locator('html')).toHaveAttribute('data-native-context-menu', expected)
}

async function closeIsGuarded(page: Page) {
  return page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })
}

for (const dirty of [false, true]) {
  test(`app surfaces suppress native Reload for an opened ${dirty ? 'dirty' : 'clean'} document @webkit`, async ({
    page
  }) => {
    await openDocument(page)
    const rows = page.getByTestId('frame-row')
    if (dirty) {
      await rows.first().getByText('Title', { exact: true }).dblclick()
      await page.getByRole('textbox', { name: 'Frame name', exact: true }).fill('Unsaved intro')
      await page.getByRole('textbox', { name: 'Frame name', exact: true }).press('Enter')
    }
    const title = `${dirty ? '• ' : ''}Northwind Launch Deck — CanvaSlide`
    const names = await rows.allTextContents()
    for (const surface of [
      rows.first().locator('button').first(),
      page.getByRole('heading', { name: 'Frames', exact: true }),
      page.getByTestId('panel-split-handle'),
      page.getByTestId('properties-pane'),
      page.getByRole('button', { name: /^Open/ }).locator('svg')
    ]) {
      await rightClick(page, surface, 'blocked')
      await expect(rows).toHaveText(names)
      await expect(page).toHaveTitle(title)
      await expect(page.getByTestId('context-menu')).toHaveCount(0)
    }
    expect(await closeIsGuarded(page)).toBe(dirty)

    if (dirty) {
      for (const name of [/^New \(/, /^Open/]) {
        const dialog = page.waitForEvent('dialog')
        const click = page.getByRole('button', { name }).click()
        const prompt = await dialog
        expect(prompt.type()).toBe('confirm')
        await prompt.dismiss()
        await click
        await expect(rows).toHaveText(names)
      }
    }

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: /^Save \(/ }).click()
    const saved = JSON.parse(await readFile((await (await download).path())!, 'utf8'))
    const original = JSON.parse(
      await readFile('examples/slides/northwind-launch-deck.canvaslide', 'utf8')
    )
    expect(saved.order).toEqual(original.order)
    expect(saved.assets).toEqual(original.assets)
    expect(Object.keys(saved.elements)).toEqual(Object.keys(original.elements))
    expect(saved.elements['frame-1'].name).toBe(dirty ? 'Unsaved intro' : 'Title')
    for (const id of original.order) {
      expect(saved.elements[id].text).toBe(original.elements[id].text)
    }
  })
}

test('text menus, frame selection and reordering remain available @webkit', async ({ page }) => {
  await openDocument(page)
  await rightClick(page, page.getByRole('textbox', { name: 'Document name' }), 'allowed')
  const rows = page.getByTestId('frame-row')
  await rows.first().getByText('Title', { exact: true }).dblclick()
  const editor = page.getByRole('textbox', { name: 'Frame name', exact: true })
  await rightClick(page, editor, 'allowed')
  await editor.fill('Opening')
  await editor.press('Enter')
  await rows.nth(1).getByText('Agenda', { exact: true }).click()
  await expect(rows.nth(1)).toHaveAttribute('data-current', 'true')
  await rows.nth(1).dragTo(rows.first())
  await expect(rows.first()).toContainText('Agenda')
  await expect(rows.nth(1)).toContainText('Opening')
  await rows.first().getByText('Agenda', { exact: true }).click()
  await page.keyboard.press('F2')
  await rightClick(page, page.getByTestId('frame-name-editor'), 'allowed')
  await page.getByTestId('frame-name-editor').press('Escape')
})

test('dialogs and non-text controls cannot expose the page menu @webkit', async ({ page }) => {
  await openDocument(page)
  await page.getByTestId('frame-row').first().getByText('Title', { exact: true }).click()
  await rightClick(page, page.getByTestId('properties-pane').locator('select').first(), 'blocked')
  await page.getByRole('button', { name: /^Settings/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await rightClick(page, dialog.getByRole('heading', { name: 'Settings' }), 'blocked')
  await rightClick(page, dialog.getByLabel('Default transition duration'), 'blocked')
  await rightClick(page, dialog.getByRole('radio', { name: 'Plain' }), 'blocked')
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByTestId('frame-row')).toHaveCount(7)
  await expect(page).toHaveTitle('Northwind Launch Deck — CanvaSlide')
})

test('canvas commands and native inline text menus coexist @webkit', async ({ page }) => {
  await openDocument(page)
  const canvas = page.getByTestId('canvas-viewport')
  await canvas.click({ position: { x: 600, y: 50 }, button: 'right' })
  const menu = page.getByTestId('context-menu')
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: 'Select all' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-native-context-menu', 'blocked')
  await page.keyboard.press('Escape')
  await page.keyboard.press('t')
  await canvas.click({ position: { x: 600, y: 50 } })
  const editor = page.locator('.canvas-text-editor')
  await expect(editor).toBeFocused()
  await editor.fill('Context menu text')
  await rightClick(page, editor, 'allowed')
  await expect(menu).toHaveCount(0)
  await editor.press('Escape')
  await expect(
    page.locator('[data-element-type="text"]', { hasText: 'Context menu text' })
  ).toHaveCount(1)
})
