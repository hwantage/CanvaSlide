import { expect, test } from '@playwright/test'

test('starts in English even when the browser language is Korean', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'ko-KR' })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:1422/CanvaSlide/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Big ideas. One little file.')
  await context.close()
})

test('language and theme survive navigation and reload', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '한국어', exact: true }).click()
  await page.getByRole('button', { name: '다크 테마로 전환' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('커다란 생각을, 하나의 파일로.')
  await page.locator('.header-nav').getByRole('link', { name: '사용 문서' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('첫 캔버스부터')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko')
  await page.goto('./docs/?guide=installation&lang=en')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Installation')
})

test('canvas frames respond to buttons, keyboard, and playback', async ({ page }) => {
  await page.goto('./')
  const demo = page.locator('#experience .canvas-demo')
  const viewport = demo.getByRole('region')
  await expect(demo).toHaveAttribute('data-scene', '1')
  const overviewTransform = await demo
    .locator('.demo-world')
    .evaluate((el) => getComputedStyle(el).transform)
  await demo.getByRole('button', { name: '2 A frame', exact: true }).click()
  await expect(demo).toHaveAttribute('data-scene', '2')
  await expect
    .poll(() => demo.locator('.demo-world').evaluate((el) => getComputedStyle(el).transform))
    .not.toBe(overviewTransform)
  await viewport.focus()
  await page.keyboard.press('ArrowRight')
  await expect(demo).toHaveAttribute('data-scene', '3')
  await page.keyboard.press('Escape')
  await expect(demo).toHaveAttribute('data-scene', '0')
  await demo.getByRole('button', { name: 'Play the story' }).click()
  await expect(demo).toHaveAttribute('data-scene', '1')
  await expect(demo.getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'true')
  await expect(demo).toHaveAttribute('data-scene', '2')
  await demo.getByRole('button', { name: 'Pause' }).click()
  await expect(demo.getByRole('button', { name: 'Play the story' })).toHaveAttribute(
    'aria-pressed',
    'false'
  )
})

test('scroll advances the story and its stage stays visible', async ({ page }) => {
  await page.goto('./')
  const story = page.locator('#story')
  await story.evaluate((element) =>
    window.scrollTo({
      top: (element as HTMLElement).offsetTop + (element.clientHeight - window.innerHeight) * 0.8,
      behavior: 'instant'
    })
  )
  await expect(story.locator('.canvas-demo')).toHaveAttribute('data-scene', '3')
  const bounds = await story.locator('.story-sticky').boundingBox()
  expect(bounds?.y).toBeGreaterThanOrEqual(80)
  expect(bounds?.y).toBeLessThan(100)
  await expect(story.getByRole('button', { name: /03 Bring everyone along/ })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
})

test('documentation search finds content and handles no results', async ({ page }) => {
  await page.goto('./docs/')
  await page.keyboard.press('/')
  const input = page.getByRole('searchbox', { name: 'Search documentation' })
  await expect(input).toBeFocused()
  await input.fill('connector')
  await expect(
    page.locator('#docs-navigation').getByRole('link', { name: 'Create & edit' })
  ).toBeVisible()
  await input.fill('nothingmatches123')
  await expect(page.getByRole('status')).toContainText('No guides found')
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(page.locator('#docs-navigation a')).toHaveCount(9)
})

test('installation explains availability and copies source commands', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('./docs/?guide=installation')
  await expect(page.locator('.docs-callout')).toContainText(
    'first public installers are being prepared'
  )
  await page.getByRole('button', { name: 'Windows', exact: true }).click()
  await expect(page.locator('.install-platforms')).toContainText('.exe')
  await page.getByRole('button', { name: 'macOS', exact: true }).click()
  await expect(page.locator('.install-platforms')).toContainText('.dmg')
  await page.getByRole('button', { name: 'Copy command' }).first().click()
  await expect(page.getByRole('status').first()).toHaveText('Copied')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('pnpm dev')
})

for (const locale of ['en', 'ko']) {
  test(`every guide opens directly with valid content and assets in ${locale}`, async ({
    page
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('response', (response) => {
      if (response.url().startsWith('http://127.0.0.1:1422/') && response.status() >= 400) {
        errors.push(`${response.status()} ${response.url()}`)
      }
    })
    for (const guide of [
      'overview',
      'installation',
      'quick-start',
      'canvas',
      'editing',
      'frames',
      'sharing',
      'shortcuts',
      'faq'
    ]) {
      await page.goto(`./docs/?guide=${guide}&lang=${locale}`)
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await expect(page.getByRole('heading', { level: 1 })).not.toBeEmpty()
      await expect(page.locator('.doc-section')).not.toHaveCount(0)
      await expect(page.locator('.doc-article')).not.toContainText(/undefined|site\.docs\.|\{\w+\}/)
      await expect(page.locator('#docs-navigation a[aria-current="page"]')).toHaveCount(1)
      const description = await page
        .locator('meta[property="og:description"]')
        .getAttribute('content')
      expect(description?.length).toBeGreaterThan(10)
    }
    expect(errors).toEqual([])
  })
}

test('mobile navigation and documentation fit a narrow screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('./?lang=ko')
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(320)
  await page.getByRole('button', { name: '메뉴 열기' }).click()
  await page.locator('.header-nav').getByRole('link', { name: '사용 문서' }).click()
  await page.getByRole('button', { name: '문서 탐색' }).click()
  await page.locator('#docs-navigation').getByRole('link', { name: '키보드 단축키' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('키보드 단축키')
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(320)
  await page.screenshot({ path: testInfo.outputPath('mobile-docs.png'), fullPage: true })
})

test('reduced motion avoids playback and animating between scenes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('./')
  const demo = page.locator('#experience .canvas-demo')
  await demo.getByRole('button', { name: 'Play the story' }).click()
  await expect(demo).toHaveAttribute('data-scene', '1')
  await expect(demo.getByRole('button', { name: 'Play the story' })).toHaveAttribute(
    'aria-pressed',
    'false'
  )
  await expect(page.locator('.sharing-section')).toHaveCSS('opacity', '1')
})

test('optional preferences still work when storage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error('Storage unavailable')
    }
    Storage.prototype.setItem = () => {
      throw new Error('Storage unavailable')
    }
  })
  await page.goto('./')
  await page.getByRole('button', { name: '한국어', exact: true }).click()
  await page.getByRole('button', { name: '다크 테마로 전환' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})
