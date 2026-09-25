import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { dragOnCanvas, primaryModifier } from './canvas-gestures'
import { storedDocuments } from './recovery-records'

// Actual IndexedDB contents establish persistence independently of the status label.
const SNAPSHOT_TIMEOUT_MS = 15_000

async function editUntilSnapshotted(page: Page, at: [number, number] = [200, 200]) {
  const before = (await storedDocuments(page)).length
  await page.getByRole('button', { name: 'Rectangle (R)', exact: true }).click()
  await dragOnCanvas(page, at, [at[0] + 220, at[1] + 140])
  await page.keyboard.press('Escape')
  await expect
    .poll(async () => (await storedDocuments(page)).length, { timeout: SNAPSHOT_TIMEOUT_MS })
    .toBe(before + 1)
}

/** Types a document name, then puts focus back on the canvas so tool shortcuts work again. */
async function nameDocument(page: Page, name: string) {
  await page.getByRole('textbox', { name: 'Document name' }).fill(name)
  await page.getByTestId('canvas-viewport').click({ position: { x: 900, y: 600 } })
}

// Chromium renderer crash bypasses all page lifecycle callbacks.
async function crash(context: BrowserContext, page: Page): Promise<Page> {
  const next = await context.newPage()
  const session = await context.newCDPSession(page)
  void session.send('Page.crash').catch(() => {})
  await page.waitForEvent('crash', { timeout: 5_000 })
  return next
}

/** Dismisses the unsaved-work warning and leaves, the way an author who means it would. */
async function leaveOnPurpose(context: BrowserContext, page: Page): Promise<Page> {
  page.on('dialog', (dialog) => void dialog.accept())
  await page.close({ runBeforeUnload: true })
  return context.newPage()
}

const recoveryPrompt = (page: Page) => page.getByRole('dialog', { name: 'Recover unsaved work' })

test('work a crash took is offered back on the next launch', async ({
  page,
  context
}, testInfo) => {
  await page.goto('/')
  await editUntilSnapshotted(page)

  const next = await crash(context, page)
  await next.goto('/')

  const dialog = recoveryPrompt(next)
  await expect(dialog).toBeVisible()
  // Nothing is restored behind the prompt: the author answers first.
  await expect(next.locator('[data-element-type="shape"]')).toHaveCount(0)
  await next.screenshot({ path: testInfo.outputPath('recovery-offer.png') })

  await dialog.getByRole('button', { name: 'Restore' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(next.locator('[data-element-type="shape"]')).toHaveCount(1)
  // Restored work is unsaved: nothing on disk holds it yet.
  await expect(next).toHaveTitle('• Untitled — CanvaSlide')
  await next.screenshot({ path: testInfo.outputPath('recovery-restored.png') })
})

test('browser navigation conservatively retains work even after a browser-owned leave prompt', async ({
  page,
  context
}) => {
  await page.goto('/')
  await editUntilSnapshotted(page)

  const next = await leaveOnPurpose(context, page)
  await next.goto('/')

  // Browser lifecycle events cannot prove which leave prompt was shown.
  await expect(next.locator('[data-element-type="shape"]')).toHaveCount(0)
  await expect(next).toHaveTitle('Untitled — CanvaSlide')
  await expect(recoveryPrompt(next)).toBeVisible()
  expect(await storedDocuments(next)).toEqual(['Untitled'])
})

test('discarding the offer deletes the copy and leaves the document alone', async ({
  page,
  context
}) => {
  await page.goto('/')
  await editUntilSnapshotted(page)

  const next = await crash(context, page)
  await next.goto('/')

  const dialog = recoveryPrompt(next)
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Discard' }).click()
  await expect(dialog).toHaveCount(0)

  await expect(next.locator('[data-element-type="shape"]')).toHaveCount(0)
  await expect(next).toHaveTitle('Untitled — CanvaSlide')
  expect(await storedDocuments(next)).toEqual([])

  // A discarded snapshot stays gone: a second launch has nothing to offer.
  await next.reload()
  await expect(recoveryPrompt(next)).toHaveCount(0)
})

test('an example link keeps a lost session intact and still asks about it', async ({
  page,
  context
}) => {
  await page.goto('/')
  await editUntilSnapshotted(page)

  const next = await crash(context, page)
  // Arriving through a showcase link is an explicit request, so the example loads; the prompt
  // still asks rather than quietly dropping a session the author never answered for.
  await next.goto('/?example=flowchart')
  await expect(next.locator('[data-element-id]').first()).toBeVisible()

  const dialog = recoveryPrompt(next)
  await expect(dialog).toBeVisible()
  expect(await storedDocuments(next)).toHaveLength(1)

  // Showing the example must not cost the lost work its copy until the author says so.
  await dialog.getByRole('button', { name: 'Discard' }).click()
  await expect(next).toHaveTitle('Order Fulfillment Flow — CanvaSlide')
  await expect.poll(async () => await storedDocuments(next)).toEqual([])
})

test('two tabs never overwrite or delete each other’s unsaved work', async ({
  context
}, testInfo) => {
  // The case that makes a single shared slot indefensible: a real document in one tab, a quick
  // look at an example in another. Neither may cost the other its only copy.
  const plan = await context.newPage()
  await plan.goto('/')
  await nameDocument(plan, 'Important plan')
  await editUntilSnapshotted(plan)

  const example = await context.newPage()
  await example.goto('/?example=flowchart')
  await expect(example.locator('[data-element-id]').first()).toBeVisible()
  // The other tab is still editing, so its work is not this tab's to answer for.
  await expect(recoveryPrompt(example)).toHaveCount(0)
  await editUntilSnapshotted(example, [600, 200])

  expect(await storedDocuments(example)).toEqual(
    expect.arrayContaining(['Important plan', 'Order Fulfillment Flow'])
  )

  const next = await context.newPage()
  for (const page of [plan, example]) {
    const session = await context.newCDPSession(page)
    void session.send('Page.crash').catch(() => {})
    await page.waitForEvent('crash', { timeout: 5_000 })
  }
  await next.goto('/')

  // Both come back, newest first, each answered on its own.
  const dialog = recoveryPrompt(next)
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('(2 left)')
  await expect(dialog).toContainText('Order Fulfillment Flow')
  await next.screenshot({ path: testInfo.outputPath('recovery-two-sessions.png') })
  await dialog.getByRole('button', { name: 'Discard' }).click()

  await expect(dialog).toContainText('Important plan')
  await expect(dialog).not.toContainText('left')
  await dialog.getByRole('button', { name: 'Restore' }).click()
  await expect(next).toHaveTitle('• Important plan — CanvaSlide')
  await expect(next.locator('[data-element-type="shape"]')).toHaveCount(1)
})

test('restoring both lost sessions keeps the first one instead of overwriting it', async ({
  context
}, testInfo) => {
  const first = await context.newPage()
  await first.goto('/')
  await nameDocument(first, 'Important plan')
  await editUntilSnapshotted(first)

  const second = await context.newPage()
  await second.goto('/')
  await nameDocument(second, 'Example tweak')
  await editUntilSnapshotted(second, [600, 200])

  const next = await context.newPage()
  for (const page of [first, second]) {
    const session = await context.newCDPSession(page)
    void session.send('Page.crash').catch(() => {})
    await page.waitForEvent('crash', { timeout: 5_000 })
  }
  await next.goto('/')

  const dialog = recoveryPrompt(next)
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Example tweak')
  // Only one document can be open, so restoring steps aside rather than queueing the next one
  // on top of what it just handed back.
  await dialog.getByRole('button', { name: 'Restore' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(next).toHaveTitle('• Example tweak — CanvaSlide')

  // The other session is still intact, and the settings dialog is how the author gets to it.
  await next.getByRole('button', { name: /^Settings/ }).click()
  const settings = next.getByRole('dialog', { name: 'Settings' })
  await expect(settings).toContainText('1 lost session is still waiting')
  await next.screenshot({ path: testInfo.outputPath('recovery-waiting.png') })
  await settings.getByRole('button', { name: 'Review' }).click()

  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Important plan')
  // Restoring over unsaved work answers to the same guard as opening a file.
  const asked: string[] = []
  next.on('dialog', async (confirm) => {
    asked.push(confirm.message())
    await confirm.dismiss()
  })
  await dialog.getByRole('button', { name: 'Restore' }).click()
  await expect.poll(() => asked.length).toBe(1)
  // Refusing returns to the editor so the recovered document can actually be saved.
  await expect(next).toHaveTitle('• Example tweak — CanvaSlide')
  await expect(dialog).toHaveCount(0)
  const download = next.waitForEvent('download')
  await next.keyboard.press(`${await primaryModifier(next)}+s`)
  await download
  await expect(next).toHaveTitle('Example tweak — CanvaSlide')
  expect(await storedDocuments(next)).toContain('Important plan')
})

test('saving the document removes the recovery copy', async ({ page }) => {
  await page.goto('/')
  await editUntilSnapshotted(page)

  const download = page.waitForEvent('download')
  await page.keyboard.press(`${await primaryModifier(page)}+s`)
  await download
  await expect(page).toHaveTitle('Untitled — CanvaSlide')

  await expect.poll(async () => await storedDocuments(page)).toEqual([])
})

test('the settings dialog says where recovery data lives and can turn it off', async ({
  page
}, testInfo) => {
  await page.goto('/')
  await editUntilSnapshotted(page)

  await page.getByRole('button', { name: /^Settings/ }).click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await expect(settings.getByText('This browser, on this computer')).toBeVisible()
  await expect(settings.getByTestId('recovery-status')).toContainText('Last copy kept at')
  await page.screenshot({ path: testInfo.outputPath('recovery-settings.png') })

  const choice = settings.getByRole('radiogroup', { name: 'Recovery copies' })
  await choice.getByRole('radio', { name: 'Off' }).click()
  await expect(settings.getByTestId('recovery-status')).toHaveText(
    'Unsaved work is not being copied anywhere.'
  )
  // Switching off is not just a label: the copy already kept is deleted.
  await expect.poll(async () => await storedDocuments(page)).toEqual([])

  await settings.getByRole('button', { name: 'Done' }).click()
  // The choice survives a restart.
  await page.reload()
  await page.getByRole('button', { name: /^Settings/ }).click()
  await expect(
    page.getByRole('dialog', { name: 'Settings' }).getByRole('radio', { name: 'Off' })
  ).toBeChecked()
})
