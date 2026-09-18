import { expect, test } from '@playwright/test'

const LATEST_JSON = 'https://github.com/hwantage/CanvaSlide/releases/latest/download/latest.json'
const RELEASES_URL = 'https://github.com/hwantage/CanvaSlide/releases'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('canvas-viewport')).toBeVisible()
})

test('reports a newer release and links to the exact download page @webkit', async ({
  page,
  context
}) => {
  await context.route(RELEASES_URL, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>Release page</title>' })
  )
  await page.route(LATEST_JSON, (route) =>
    route.fulfill({
      json: { version: '99.0.0', notes: 'Big release', pub_date: '2030-01-01T00:00:00Z' }
    })
  )
  await page.getByRole('button', { name: /Settings/ }).click()
  const section = page.getByTestId('update-section')
  await expect(section.getByTestId('current-version')).not.toHaveText('')
  await section.getByRole('button', { name: 'Check for updates' }).click()
  await expect(section.getByTestId('update-status')).toHaveText('Version 99.0.0 is available.')
  await expect(section).toContainText('Big release')
  const popup = page.waitForEvent('popup')
  await section.getByRole('button', { name: 'Open download page' }).click()
  const releasePage = await popup
  await expect(releasePage).toHaveURL(RELEASES_URL)
  expect(await releasePage.evaluate(() => window.opener)).toBeNull()
  await releasePage.close()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('update-badge')).toBeVisible()
})

test('surfaces native link failures and retries through the opener @webkit', async ({ page }) => {
  await page.route(LATEST_JSON, (route) => route.fulfill({ json: { version: '99.0.0' } }))
  await page.getByRole('button', { name: /Settings/ }).click()
  const section = page.getByTestId('update-section')
  await section.getByRole('button', { name: 'Check for updates' }).click()
  await expect(section.getByTestId('update-status')).toHaveText('Version 99.0.0 is available.')

  const errors: string[] = []
  const opened: unknown[] = []
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.exposeFunction('recordOpen', (args: unknown) => opened.push(args))
  await page.exposeFunction('recordError', (message: string) => errors.push(message))
  // Exercise real UI and plugin bindings; the OS boundary is mocked here, not a native runtime.
  await page.evaluate(() => {
    const record = window as unknown as {
      recordOpen: (args: unknown) => Promise<void>
      recordError: (message: string) => Promise<void>
    }
    let attempts = 0
    Object.assign(window, {
      __TAURI_INTERNALS__: {
        invoke: async (command: string, args: { message?: string }) => {
          if (command === 'plugin:opener|open_url') {
            await record.recordOpen(args)
            if (++attempts === 1) {
              throw 'URL is not allowed'
            }
            return
          }
          if (command === 'plugin:dialog|message') {
            await record.recordError(args.message ?? '')
            return
          }
          throw new Error(`Unexpected native command: ${command}`)
        }
      }
    })
  })
  const button = section.getByRole('button', { name: 'Open download page' })
  await button.click()
  await expect.poll(() => errors).toEqual(['Could not open the download page: URL is not allowed'])
  await expect(button).toBeVisible()
  await button.click()
  await expect.poll(() => opened).toEqual([{ url: RELEASES_URL }, { url: RELEASES_URL }])
  expect(errors).toHaveLength(1)
  expect(pageErrors).toEqual([])
})

test('says so when already on the latest version and surfaces failures', async ({ page }) => {
  await page.route(LATEST_JSON, (route) => route.fulfill({ json: { version: '0.0.1' } }))
  await page.getByRole('button', { name: /Settings/ }).click()
  const section = page.getByTestId('update-section')
  await section.getByRole('button', { name: 'Check for updates' }).click()
  await expect(section.getByTestId('update-status')).toHaveText('You are on the latest version.')
  await page.unroute(LATEST_JSON)
  await page.route(LATEST_JSON, (route) => route.fulfill({ status: 500 }))
  await section.getByRole('button', { name: 'Check for updates' }).click()
  await expect(section.getByTestId('update-status')).toContainText('Update check failed')
})
