import { expect, test } from '@playwright/test'

for (const { opener, label, close } of [
  { opener: /^Settings/, label: 'Settings', close: 'Done' },
  { opener: /^Keyboard shortcuts/, label: 'Keyboard shortcuts', close: 'Done' },
  { opener: /^Export$/, label: 'Export presentation', close: 'Cancel' },
  { opener: /^Share$/, label: 'Cloud share', close: 'Close' }
]) {
  test(`${label} contains focus and restores its opener on every close path @webkit`, async ({
    page
  }) => {
    await page.goto('/')
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
