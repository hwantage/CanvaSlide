import { expect, test } from '@playwright/test'

const LATEST_JSON = 'https://github.com/hwantage/CanvaSlide/releases/latest/download/latest.json'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('canvas-viewport')).toBeVisible()
})

test('reports a newer release and links to the download page', async ({ page }) => {
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
  expect((await popup).url()).toContain('github.com/hwantage/CanvaSlide/releases')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('update-badge')).toBeVisible()
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
