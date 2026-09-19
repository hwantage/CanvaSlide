import { expect, test } from '@playwright/test'

test('opens and dismisses nested dialogs without requiring the modal pseudo-class @webkit', async ({
  page
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    const queryAll = Document.prototype.querySelectorAll
    Object.defineProperty(Document.prototype, 'querySelectorAll', {
      value(this: Document, selector: string) {
        if (selector.includes(':modal')) {
          throw new DOMException('Unsupported pseudo-class', 'SyntaxError')
        }
        return queryAll.call(this, selector)
      }
    })
  })
  await page.goto('/')
  const shareButton = page.getByRole('button', { name: 'Share', exact: true })
  await shareButton.focus()
  await page.keyboard.press('Enter')
  const share = page.getByRole('dialog', { name: 'Share', exact: true })
  await expect(share).toBeVisible()
  const exportButton = share.getByRole('button', { name: 'Export HTML', exact: true })
  await exportButton.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Export presentation' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(exportButton).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(shareButton).toBeFocused()
  expect(errors).toEqual([])
})

for (const { opener, label, close } of [
  { opener: /^Settings/, label: 'Settings', close: 'Done' },
  { opener: /^Keyboard shortcuts/, label: 'Keyboard shortcuts', close: 'Done' },
  { opener: /^About CanvaSlide$/, label: 'About CanvaSlide', close: 'Done' },
  { opener: /^Export HTML$/, label: 'Export presentation', close: 'Cancel' },
  { opener: /^Share$/, label: 'Share', close: 'Close' }
]) {
  test(`${label} contains focus and restores its opener on every close path @webkit`, async ({
    page
  }) => {
    await page.goto('/')
    if (label === 'Export presentation') {
      await page.getByRole('button', { name: 'Share', exact: true }).click()
    }
    const button = page.getByRole('button', { name: opener, includeHidden: true })
    const dialog = page.getByRole('dialog', { name: label })
    for (const method of ['Escape', 'button', 'backdrop']) {
      await button.focus()
      await page.keyboard.press('Enter')
      await expect(dialog).toBeVisible()
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
        true
      )
      await dialog.getByRole('button', { name: close, exact: true }).focus()
      for (let i = 0; i < 12; i += 1) {
        await page.keyboard.press('Tab')
        expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
          true
        )
      }
      for (let i = 0; i < 12; i += 1) {
        await page.keyboard.press('Shift+Tab')
        expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
          true
        )
      }
      // Even programmatic attempts cannot move focus into the modal's background.
      await button.evaluate((element) => element.focus())
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
        true
      )
      if (method === 'Escape') {
        await page.keyboard.press('Escape')
      } else if (method === 'button') {
        await dialog.getByRole('button', { name: close, exact: true }).click()
      } else {
        await page.mouse.click(10, 10)
      }
      await expect(dialog).toHaveCount(0)
      await expect(button).toBeFocused()
    }
  })
}
