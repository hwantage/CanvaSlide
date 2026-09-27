import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

const origin = 'https://hwantage.github.io'
const base = '/CanvaSlide/'

test('all sitemap pages ship readable localized HTML, metadata and reciprocal links without JavaScript', async ({
  browser,
  request
}) => {
  const sitemap = await request.get('./sitemap.xml')
  expect(sitemap.ok()).toBe(true)
  const xml = await sitemap.text()
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]!)
  expect(new Set(urls).size).toBe(28)
  expect(xml).not.toContain('<lastmod>')
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  const titles = new Set<string>()
  const documents = new Map<string, { ids: string[]; links: string[] }>()
  for (const url of urls) {
    const path = new URL(url).pathname
    const relative = path.slice(base.length)
    // A real file is required: Vite's SPA fallback must never make a missing route pass.
    const html = await readFile(resolve('website/dist', relative, 'index.html'), 'utf8')
    expect(html).toContain('<main')
    expect(html).not.toContain('<div id="root"></div>')
    const response = await page.goto(`http://127.0.0.1:1422${path}`)
    expect(response?.status()).toBe(200)
    const locale = relative.startsWith('ko/') ? 'ko' : 'en'
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.locator('main')).not.toContainText(/undefined|site\.docs\.|\{\w+\}/)
    const title = await page.title()
    expect(titles.has(title)).toBe(false)
    titles.add(title)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', url)
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', url)
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      /^https:\/\//
    )
    const unlocalized = relative.replace(/^ko\//, '')
    if (unlocalized === 'docs/installation/') {
      await expect(page.locator('.install-platforms')).toContainText('.dmg')
      await expect(page.locator('.install-platforms')).toContainText('.exe')
      await expect(page.locator('.install-platforms p:visible')).toHaveCount(2)
    }
    for (const alternate of ['en', 'ko', 'x-default']) {
      const expected = `${origin}${base}${alternate === 'ko' ? 'ko/' : ''}${unlocalized}`
      await expect(page.locator(`link[hreflang="${alternate}"]`)).toHaveAttribute('href', expected)
      expect(xml).toContain(`hreflang="${alternate}" href="${expected}"`)
    }
    const structured = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent())!
    )
    const webpage = structured['@graph'].find(
      (item: Record<string, unknown>) => item['@type'] === 'WebPage'
    )
    expect(webpage.url).toBe(url)
    expect(webpage.inLanguage).toBe(locale)
    expect(webpage.name).toBe(title)
    if (unlocalized === '') {
      await expect(page.locator('#faq details')).toHaveCount(10)
      for (const item of await page.locator('#faq details').all()) {
        expect((await item.locator('p').textContent())!.length).toBeGreaterThan(20)
        await item.locator('summary').click()
      }
      await expect(page.locator('#faq details').nth(2).locator('p')).toBeVisible()
    }
    documents.set(
      path,
      await page.evaluate(() => ({
        ids: Array.from(document.querySelectorAll('[id]'), (element) => element.id),
        links: Array.from(
          document.querySelectorAll<HTMLAnchorElement>('a[href]'),
          (element) => element.href
        )
      }))
    )
  }
  for (const [path, document] of documents) {
    for (const href of document.links) {
      const link = new URL(href)
      if (
        link.origin !== 'http://127.0.0.1:1422' ||
        !link.pathname.startsWith(base) ||
        /\.[a-z]+$/i.test(link.pathname)
      ) {
        continue
      }
      expect(documents.has(link.pathname), `${path} links to missing ${link.pathname}`).toBe(true)
      expect(link.search).toBe('')
      if (link.hash) {
        expect(documents.get(link.pathname)!.ids, href).toContain(
          decodeURIComponent(link.hash.slice(1))
        )
      }
    }
  }
  await context.close()
})

test('hydration preserves canonical metadata and has no browser errors on every route', async ({
  page,
  request
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
  const xml = await (await request.get('./sitemap.xml')).text()
  for (const [, url] of xml.matchAll(/<loc>(.*?)<\/loc>/g)) {
    const path = new URL(url!).pathname
    await page.goto(`http://127.0.0.1:1422${path}`)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('.theme-switch')).toHaveAttribute('aria-label', /light|라이트/)
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', url!)
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', url!)
  }
  expect(errors).toEqual([])
})

test('legacy queries migrate to real routes, preserving anchors and unrelated parameters', async ({
  page
}) => {
  await page.goto('./docs/?guide=frames&lang=ko&from=old#detail-frames')
  await expect(page).toHaveURL(/\/ko\/docs\/frames\/\?from=old#detail-frames$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko')
  await expect(page.locator('#detail-frames')).toBeInViewport()
  await page.goto('./showcase/index.html?lang=ko')
  await expect(page).toHaveURL(/\/ko\/showcase\/$/)
  await page.goto('./docs/?guide=unknown&lang=unknown')
  await expect(page).toHaveURL(/\/CanvaSlide\/docs\/$/)
  await expect(page.locator('#docs-navigation [aria-current="page"]')).toHaveText('Welcome')
})

test('language paths override stored preferences and link to the equivalent guide', async ({
  page
}) => {
  await page.addInitScript(() => localStorage.setItem('canvaslide-site-language', 'ko'))
  await page.goto('./docs/ai/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.locator('.language-switch').getByRole('link', { name: '한국어' }).click()
  await expect(page).toHaveURL(/\/ko\/docs\/ai\/$/)
  await expect(page.locator('h1')).toHaveText('AI와 함께 만들기')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko')
  await expect(page.locator('.language-switch a[lang="en"]')).toHaveAttribute(
    'href',
    '/CanvaSlide/docs/ai/'
  )
})

test('FAQ disclosures and navigation work without JavaScript on a narrow screen', async ({
  browser
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 320, height: 740 }
  })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:1422/CanvaSlide/ko/')
  const question = page.locator('#faq details').nth(4)
  await question.locator('summary').click()
  await expect(question.locator('p')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await question.getByRole('link').click()
  await expect(page).toHaveURL(/\/ko\/docs\/ai\/$/)
  await expect(page.locator('h1')).toBeVisible()
  await context.close()
})
