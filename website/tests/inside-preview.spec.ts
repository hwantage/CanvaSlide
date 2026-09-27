import { expect, test } from '@playwright/test'

test('Inside animates only in view, can be stopped, and opens its editable source', async ({
  page
}) => {
  const animations: string[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/inside-8-13.webp')) {
      animations.push(request.url())
    }
  })
  await page.goto('./')
  const preview = page.locator('.inside-preview')
  const image = preview.getByRole('img')
  await expect(image).toHaveAttribute('src', /inside-preview\.webp$/)
  expect(animations).toHaveLength(0)
  await preview.scrollIntoViewIfNeeded()
  await expect(image).toHaveAttribute('src', /inside-8-13\.webp$/)
  await image.evaluate((element) => (element as HTMLImageElement).decode())
  await expect(preview.getByRole('link', { name: 'Open example' })).toHaveAttribute(
    'href',
    /\?example=inside$/
  )
  await preview.getByRole('button', { name: 'Stop preview' }).focus()
  await page.keyboard.press('Enter')
  await expect(image).toHaveAttribute('src', /inside-preview\.webp$/)
  await page.locator('h1').scrollIntoViewIfNeeded()
  await preview.scrollIntoViewIfNeeded()
  await expect(image).toHaveAttribute('src', /inside-preview\.webp$/)
  await preview.getByRole('button', { name: 'Replay preview' }).click()
  await expect(image).toHaveAttribute('src', /inside-8-13\.webp$/)
  await page.locator('h1').scrollIntoViewIfNeeded()
  await expect(image).toHaveAttribute('src', /inside-preview\.webp$/)
})

test('Inside uses a static image for reduced motion, including preference changes on mobile', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const animations: string[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/inside-8-13.webp')) {
      animations.push(request.url())
    }
  })
  await page.goto('./ko/')
  const preview = page.locator('.inside-preview')
  const image = preview.getByRole('img')
  await preview.scrollIntoViewIfNeeded()
  await expect(image).toHaveAttribute('src', /inside-preview\.webp$/)
  await expect(preview.getByRole('button')).toHaveCount(0)
  expect(animations).toHaveLength(0)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(image).toHaveAttribute('src', /inside-8-13\.webp$/)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(image).toHaveAttribute('src', /inside-preview\.webp$/)
  await expect(preview.getByRole('button')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
})

test('Inside has an initial static preview and usable source link without JavaScript', async ({
  browser
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:1422/CanvaSlide/ko/')
  const preview = page.locator('.inside-preview')
  await preview.scrollIntoViewIfNeeded()
  await expect(preview.getByRole('img')).toHaveAttribute('src', /inside-preview\.webp$/)
  await expect(preview).toContainText('8~13번 프레임')
  await expect(preview.getByRole('link', { name: '예제 열기' })).toHaveAttribute(
    'href',
    /\?example=inside$/
  )
  await expect(preview.getByRole('button')).toHaveCount(0)
  await context.close()
})
