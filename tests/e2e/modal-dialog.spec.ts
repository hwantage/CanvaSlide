import { expect, test, type Locator, type Page } from '@playwright/test'
import { appModuleUrl } from './app-module'
import { dragOnCanvas, primaryModifier } from './canvas-gestures'

/** Keys pressed before the editor has mounted would miss its listeners. */
async function openEditor(page: Page) {
  await page.goto('/')
  await expect(page.getByTestId('canvas-viewport')).toBeVisible()
}

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

/** Offers one unreadable recovery copy, as a launch after a crash would. */
async function promptRecovery(page: Page) {
  await page.evaluate(async (url) => {
    const { useRecoveryStore } = await import(url)
    useRecoveryStore.setState({
      prompting: true,
      offers: [{ sessionId: 'crashed', quarantined: true, version: null }],
      batchRemaining: 1
    })
  }, appModuleUrl('store/recovery-store.ts'))
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
  await openEditor(page)
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
  await openEditor(page)
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
  await openEditor(page)
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
  await openEditor(page)
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
  await openEditor(page)
  for (const x of [200, 700]) {
    await page.keyboard.press('f')
    await dragOnCanvas(page, [x, 200], [x + 300, 450])
  }
  await page.keyboard.press('Escape')
  await page.keyboard.press('F5')
  const counter = page.getByTestId('presentation-counter')
  await expect(counter).toContainText('1 / 2')
  await promptRecovery(page)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.keyboard.press('ArrowRight')
  await expect(counter).toContainText('2 / 2')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Recover unsaved work' })).toBeVisible()
})

test('the recovery prompt stays open when repeated Escape makes the browser force-close it @core-interaction', async ({
  page
}) => {
  await openEditor(page)
  await promptRecovery(page)
  const prompt = page.getByRole('dialog', { name: 'Recover unsaved work' })
  await expect(prompt).toBeVisible()
  // Chromium stops honouring cancel after repeated Escape without other user activation.
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press('Escape')
  }
  await expect(prompt).toBeVisible()
  expect(await prompt.evaluate((dialog) => (dialog as HTMLDialogElement).open)).toBe(true)
  await prompt.getByRole('button', { name: 'Later', exact: true }).click()
  await expect(prompt).toHaveCount(0)
  await page.keyboard.press('r')
  await expect(page.getByRole('button', { name: /^Rectangle/ })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
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
