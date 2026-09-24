import { expect, test, type Locator, type Page } from '@playwright/test'
import { dragOnCanvas, primaryModifier } from './canvas-gestures'

/** Focus that falls back to the body sends keys to the window listeners instead of the dialog. */
async function blurToBody(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
}

/** Records whether the browser's own cancel fired and whether the app claimed the key. */
async function watchEscape(dialog: Locator) {
  await dialog.evaluate((element) => {
    const record = { cancels: 0, prevented: false }
    Object.assign(window, { escapeRecord: record })
    element.addEventListener('cancel', () => (record.cancels += 1))
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        record.prevented = event.defaultPrevented
      }
    })
  })
}

const escapeRecord = (page: Page) =>
  page.evaluate(() => (window as unknown as { escapeRecord: object }).escapeRecord)

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

test('a dialog opened from component state keeps canvas keys from the selection behind it @core-interaction', async ({
  page
}) => {
  await page.goto('/')
  await page.keyboard.press('r')
  await dragOnCanvas(page, [300, 300], [420, 380])
  const shapes = page.locator('[data-element-type="shape"]')
  await expect(shapes).toHaveCount(1)
  await page.getByRole('button', { name: 'Insert video link', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Insert video link' })
  await expect(dialog).toBeVisible()
  await blurToBody(page)
  await page.keyboard.press('Delete')
  await expect(shapes).toHaveCount(1)
  await watchEscape(dialog)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  // The app closes it, not the browser's cancel, so both paths never close a dialog twice.
  expect(await escapeRecord(page)).toEqual({ cancels: 0, prevented: true })
  await page.keyboard.press('Delete')
  await expect(shapes).toHaveCount(0)
})

test('Escape from the body closes only the top dialog @core-interaction', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  const share = page.getByRole('dialog', { name: 'Share', exact: true })
  await share.getByRole('button', { name: 'Export HTML', exact: true }).click()
  const exportDialog = page.getByRole('dialog', { name: 'Export presentation' })
  await expect(exportDialog).toBeVisible()
  await blurToBody(page)
  await page.keyboard.press('Escape')
  await expect(exportDialog).toHaveCount(0)
  await expect(share).toBeVisible()
})

test('Escape from the body closes a dialog before the compact side panel behind it @core-interaction', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Open panels', exact: true }).click()
  const panel = page.getByTestId('side-panel')
  await expect(panel).toBeVisible()
  await page.keyboard.press(`${await primaryModifier(page)}+,`)
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
  await expect(settings).toBeVisible()
  await blurToBody(page)
  await page.keyboard.press('Escape')
  await expect(settings).toHaveCount(0)
  await expect(panel).toBeVisible()
})

test('a paste inside a dialog stays out of the canvas behind it @core-interaction', async ({
  page
}) => {
  await page.goto('/')
  await page.keyboard.press(`${await primaryModifier(page)}+,`)
  const done = page
    .getByRole('dialog', { name: 'Settings', exact: true })
    .getByRole('button', { name: 'Done', exact: true })
  await done.focus()
  await done.evaluate((button) => {
    const data = new DataTransfer()
    data.setData('text/plain', 'Pasted behind the dialog')
    button.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  })
  await done.click()
  await expect(page.locator('[data-element-type="text"]')).toHaveCount(0)
})

test('a recovery prompt that arrives during a slide show waits for it to end @core-interaction', async ({
  page
}) => {
  // Why: the store's module URL is read back from resource timing, which the app outgrows.
  await page.addInitScript(() => performance.setResourceTimingBufferSize(10_000))
  await page.goto('/')
  for (const x of [200, 700]) {
    await page.keyboard.press('f')
    await dragOnCanvas(page, [x, 200], [x + 300, 450])
  }
  await page.keyboard.press('Escape')
  await page.keyboard.press('F5')
  const counter = page.getByTestId('presentation-counter')
  await expect(counter).toContainText('1 / 2')
  await page.evaluate(async () => {
    const url = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => name.includes('/src/store/recovery-store.ts'))
      .at(-1)!
    const { useRecoveryStore } = await import(url)
    useRecoveryStore.setState({
      prompting: true,
      offers: [{ sessionId: 'crashed', quarantined: true, version: null }],
      batchRemaining: 1
    })
  })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.keyboard.press('ArrowRight')
  await expect(counter).toContainText('2 / 2')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Recover unsaved work' })).toBeVisible()
})

for (const { opener, label, close } of [
  { opener: /^Create with AI$/, label: 'Create with AI and CanvaSlide', close: 'Close AI guide' },
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
