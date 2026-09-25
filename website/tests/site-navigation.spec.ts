import { expect, test, type Page } from '@playwright/test'

for (const width of [320, 1440]) {
  for (const lang of ['en', 'ko']) {
    for (const theme of ['light', 'dark'] as const) {
      test(`navigation identifies the page at ${width}px in ${lang}/${theme}`, async ({
        page,
        browserName
      }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
        const labels =
          lang === 'ko' ? ['제품', 'ShowCase', '사용 문서'] : ['Product', 'ShowCase', 'Docs']
        for (const [index, route] of [
          '',
          'showcase/index.html',
          'docs/?guide=installation'
        ].entries()) {
          await page.goto(`./${route}${route.includes('?') ? '&' : '?'}lang=${lang}`)
          if (width === 320) {
            await page.locator('.mobile-menu').click()
          }
          const nav = page.locator('.header-nav')
          await expect(nav.locator('a:not(.source-link)')).toHaveText(labels)
          const current = nav.locator('[aria-current="page"]')
          await expect(current).toHaveCount(1)
          await expect(current).toHaveText(labels[index]!)
          const foreground = await page.locator('body').evaluate((el) => getComputedStyle(el).color)
          await expect(current).toHaveCSS('background-color', foreground)
          await current.hover()
          await expect(current).toHaveCSS('background-color', foreground)
          await page.locator('.site-header .brand').focus()
          // macOS WebKit uses Option+Tab to include links in keyboard navigation.
          const tabKey =
            browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab'
          for (let step = 0; step <= index; step++) {
            await page.keyboard.press(tabKey)
          }
          await expect(current).toBeFocused()
          await expect(current).toHaveCSS('outline-style', 'solid')
          await expect(current).toHaveCSS('outline-width', '3px')
          await page.evaluate(() => scrollTo({ top: 650, behavior: 'instant' }))
          await expect(current).toBeInViewport()
          await expect(current).toHaveAttribute('aria-current', 'page')
          await expect(page.locator('.site-header a[href*="#download"]')).toHaveCount(0)
          for (const region of ['.site-header', '.site-footer']) {
            const github = page.locator(region).getByRole('link', { name: 'GitHub', exact: true })
            await expect(github).toHaveAttribute('href', 'https://github.com/hwantage/CanvaSlide')
            await expect(github.locator('img')).toHaveAttribute(
              'src',
              new RegExp(`github-mark-${theme}\\.svg$`)
            )
          }
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth)
          ).toBeLessThanOrEqual(width)
        }
        await page.reload()
        await expect(page.locator('.header-nav [aria-current="page"]')).toHaveText(labels[2]!)
      })
    }
  }
}

async function pixels(page: Page, png: Buffer) {
  return page.evaluate(async (base64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${base64}`
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const { data } = ctx.getImageData(0, 0, img.width, img.height)
    return { width: img.width, height: img.height, data: Array.from(data) }
  }, png.toString('base64'))
}

for (const theme of ['light', 'dark'] as const) {
  test(`logo margins reveal the scrolled header background in ${theme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.goto('./')
    await page.evaluate(() => scrollTo({ top: 650, behavior: 'instant' }))
    // A contrasting surface exposes an opaque matte even when the page happens to be white.
    await page.addStyleTag({ content: '.site-header { background: var(--site-soft-blue) }' })
    const brand = page.locator('.site-header .brand')
    const img = brand.locator('.brand-full')
    await img.evaluate((el) => (el as HTMLImageElement).decode())
    const visible = await pixels(page, await brand.screenshot())
    await img.evaluate((el) => {
      el.style.visibility = 'hidden'
    })
    const hidden = await pixels(page, await brand.screenshot())
    let artworkPixels = 0
    for (let y = 0; y < visible.height; y++) {
      for (let x = 0; x < visible.width; x++) {
        const i = (y * visible.width + x) * 4
        const delta = Math.max(
          ...[0, 1, 2].map((channel) =>
            Math.abs(visible.data[i + channel]! - hidden.data[i + channel]!)
          )
        )
        if (y < 4 || y >= visible.height - 4) {
          expect(delta).toBeLessThanOrEqual(1)
        }
        if (delta > 20) {
          artworkPixels++
        }
      }
    }
    expect(artworkPixels).toBeGreaterThan(500)
  })
}

test('the footer links the third-party notices this build ships', async ({ page }) => {
  await page.goto('./?lang=ko')
  const link = page
    .locator('.site-footer')
    .getByRole('link', { name: '타사 고지 사항', exact: true })
  await expect(link).toHaveAttribute('href', '/CanvaSlide/THIRD-PARTY-NOTICES.txt')
  const response = await page.request.get(await link.evaluate((a: HTMLAnchorElement) => a.href))
  expect(response.headers()['content-type']).toMatch(/^text\/plain/)
  const notices = await response.text()
  for (const bundled of ['react', 'react-dom', 'lucide-react', 'vite', 'rolldown', 'tailwindcss']) {
    expect(notices).toMatch(new RegExp(`^${bundled} \\d+\\.\\d+\\.\\d+ \\(`, 'm'))
  }
  expect(notices).not.toContain('Rust crates')
})
