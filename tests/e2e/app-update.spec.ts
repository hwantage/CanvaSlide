import { expect, test, type Page } from '@playwright/test'
import { appModuleUrl } from './app-module'
import { waitForEditor } from './editor-ready'

const RELEASES_URL = 'https://github.com/hwantage/CanvaSlide/releases'

async function offerUpdate(page: Page) {
  // Inject the native check result; browser deployments deliberately never contact the update feed.
  await page.evaluate(async (url) => {
    const { useUpdateStore } = await import(url)
    useUpdateStore.setState({
      status: 'available',
      update: { version: '99.0.0', notes: 'Big release', installable: false }
    })
  }, appModuleUrl('store/update-store.ts'))
}

// Why: the About controls read the runtime when they render, so a fake shell injected after load is enough.
async function fakeDesktopUpdater(page: Page) {
  await page.evaluate(() => {
    const checks: unknown[] = []
    Object.assign(window, {
      __updateChecks: checks,
      __TAURI_INTERNALS__: {
        metadata: { currentWindow: { label: 'main' } },
        invoke: async (command: string, args: unknown) => {
          if (command === 'plugin:updater|check') {
            checks.push(args)
            return null
          }
          throw new Error(`Unexpected native command: ${command}`)
        }
      }
    })
  })
}

const updateChecks = (page: Page) =>
  page.evaluate(() => (window as unknown as { __updateChecks: unknown[] }).__updateChecks.length)

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await waitForEditor(page)
})

test('reports desktop updates in About and links to the exact download page @webkit', async ({
  page,
  context
}) => {
  await context.route(RELEASES_URL, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>Release page</title>' })
  )
  await offerUpdate(page)
  const aboutButton = page.getByRole('button', { name: 'Update available · About CanvaSlide' })
  await expect(aboutButton.getByTestId('update-badge')).toBeVisible()
  await expect(
    page.getByRole('button', { name: /^Settings/ }).getByTestId('update-badge')
  ).toHaveCount(0)
  await aboutButton.click()
  const about = page.getByRole('dialog', { name: 'About CanvaSlide' })
  await expect(about.getByRole('status')).toHaveText('Version 99.0.0 is available.')
  await expect(about).toContainText('Big release')
  const popup = page.waitForEvent('popup')
  await about.getByRole('button', { name: 'Open download page' }).click()
  const releasePage = await popup
  await expect(releasePage).toHaveURL(RELEASES_URL)
  expect(await releasePage.evaluate(() => window.opener)).toBeNull()
  await releasePage.close()
  await page.keyboard.press('Escape')
  await expect(aboutButton.getByTestId('update-badge')).toBeVisible()
})

test('surfaces native link failures and retries through the opener @webkit', async ({ page }) => {
  await offerUpdate(page)
  await page.getByRole('button', { name: /About CanvaSlide/ }).click()
  const errors: string[] = []
  const opened: unknown[] = []
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.exposeFunction('recordOpen', (args: unknown) => opened.push(args))
  await page.exposeFunction('recordError', (message: string) => errors.push(message))
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
  const button = page.getByRole('button', { name: 'Open download page' })
  await button.click()
  await expect.poll(() => errors).toEqual(['Could not open the download page: URL is not allowed'])
  await button.click()
  await expect.poll(() => opened).toEqual([{ url: RELEASES_URL }, { url: RELEASES_URL }])
  expect(errors).toHaveLength(1)
  expect(pageErrors).toEqual([])
})

test('web startup never requests an update and Settings puts border before transition @webkit', async ({
  page
}) => {
  const requests: string[] = []
  await page.route('https://github.com/**', (route) => {
    requests.push(route.request().url())
    return route.abort()
  })
  await page.clock.install()
  await page.reload()
  await page.clock.fastForward(5000)
  await page.getByRole('button', { name: /^Settings/ }).click()
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
  await expect(settings.getByRole('heading', { name: 'Updates', exact: true })).toHaveCount(0)
  await expect(settings.getByRole('button', { name: 'Check for updates' })).toHaveCount(0)
  await expect(settings.getByRole('checkbox')).toHaveCount(0)
  const border = await settings.getByRole('radiogroup', { name: 'Frame border' }).boundingBox()
  const transition = await settings.getByRole('slider').boundingBox()
  expect(border!.y + border!.height).toBeLessThan(transition!.y)
  expect(requests).toEqual([])
})

test('desktop About checks on demand and remembers the launch-check choice @webkit', async ({
  page
}) => {
  const aboutButton = page.getByRole('button', { name: 'About CanvaSlide' })
  const about = page.getByRole('dialog', { name: 'About CanvaSlide' })
  const checkNow = about.getByRole('button', { name: 'Check for updates', exact: true })
  const atLaunch = about.getByRole('checkbox', { name: 'Check for updates at launch' })
  await aboutButton.click()
  await expect(about).toBeVisible()
  await expect(checkNow).toHaveCount(0)
  await expect(atLaunch).toHaveCount(0)
  await page.keyboard.press('Escape')

  await fakeDesktopUpdater(page)
  await aboutButton.click()
  await expect(atLaunch).toBeChecked()
  await checkNow.click()
  await expect(about.getByRole('status')).toHaveText('You are on the latest version.')
  expect(await updateChecks(page)).toBe(1)
  await atLaunch.uncheck()
  expect(await page.evaluate(() => localStorage.getItem('canvaslide.updates.checkOnLaunch'))).toBe(
    'off'
  )
  expect(await updateChecks(page)).toBe(1)

  await page.reload()
  await waitForEditor(page)
  await fakeDesktopUpdater(page)
  await aboutButton.click()
  await expect(atLaunch).not.toBeChecked()
  await checkNow.click()
  await expect(about.getByRole('status')).toHaveText('You are on the latest version.')
  expect(await updateChecks(page)).toBe(1)
})
