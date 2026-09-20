import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { exampleCatalog, exampleAssetPath } from '../../src/shared/example-catalog'

for (const lang of ['en', 'ko']) {
  test(`ShowCase links, previews, source downloads and direct reload work in ${lang}`, async ({
    page,
    request
  }) => {
    await page.goto(`./showcase/?lang=${lang}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ShowCase')
    await expect(page.locator('.header-nav [aria-current="page"]')).toHaveText('ShowCase')
    await expect(page.locator('main article')).toHaveCount(exampleCatalog.length)
    await expect(page.locator('main')).not.toContainText(/undefined|site\.showcase\.|\{\w+\}/)
    for (const { id, source } of exampleCatalog) {
      const link = page.locator(`main a.button[href$="?example=${id}"]`)
      await expect(link).toHaveAttribute('href', `https://canvaslide.pages.dev/?example=${id}`)
      await expect(link).toHaveAttribute('target', '_blank')
      const image = page.locator(`img[src$="/${id}-showcase.png"]`)
      await image.scrollIntoViewIfNeeded()
      await expect
        .poll(() => image.evaluate((img) => (img as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0)
      const downloaded = await request.get(`./${exampleAssetPath(id)}`)
      expect(downloaded.status()).toBe(200)
      const body = await downloaded.body()
      expect(body.byteLength).toBeLessThanOrEqual(25 * 1024 * 1024)
      expect(body.equals(await readFile(`examples/${source}`))).toBe(true)
    }
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ShowCase')
    const manifest = await request.get('./examples/catalog.json')
    expect(await manifest.json()).toEqual(
      exampleCatalog.map(({ id }) => ({ id, file: exampleAssetPath(id) }))
    )
  })
}

test('ShowCase is keyboard reachable and fits small screens in both themes', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('./?lang=en')
  await page.getByRole('button', { name: 'Open navigation' }).click()
  const link = page.locator('.header-nav').getByRole('link', { name: 'ShowCase' })
  await link.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ShowCase')
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') {
      await page.getByRole('button', { name: 'Switch to dark theme' }).click()
    }
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(320)
  }
  const open = page.locator('.featured-copy a.button')
  await open.focus()
  await expect(open).toBeFocused()
})

test('the source downloads as an immediately editable document', async ({ page }) => {
  await page.goto('./showcase/')
  const link = page.locator('a[download][href$="/freefall.canvaslide"]')
  const downloadEvent = page.waitForEvent('download')
  await link.click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toBe('freefall.canvaslide')
  const path = await download.path()
  expect(path).not.toBeNull()
  const bytes = await readFile(path!)
  expect(bytes.byteLength).toBeLessThanOrEqual(25 * 1024 * 1024)
  expect(bytes.equals(await readFile('examples/showcase/freefall.canvaslide'))).toBe(true)
})
