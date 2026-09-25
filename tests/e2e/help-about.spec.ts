import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { dragOnCanvas } from './canvas-gestures'
import { waitForEditor } from './editor-ready'

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
const repositoryUrl = 'https://github.com/hwantage/CanvaSlide'
const releasesUrl = `${repositoryUrl}/releases`

test('toolbar orders help, repository, About and settings and opens each destination @webkit', async ({
  page,
  context
}) => {
  await context.route('https://github.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>GitHub</title>' })
  )
  await page.goto('/')
  const header = page.getByRole('banner')
  const labels = await header
    .getByRole('button')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')))
  const start = labels.indexOf('Keyboard shortcuts (K)')
  expect(start).toBeGreaterThan(-1)
  expect(labels.slice(start, start + 4)).toEqual([
    'Keyboard shortcuts (K)',
    'GitHub repository',
    'About CanvaSlide',
    expect.stringMatching(/^Settings/)
  ])
  await expect(
    header.getByRole('button', { name: 'Keyboard shortcuts (K)', exact: true })
  ).toHaveText('K')
  const github = header.getByRole('button', { name: 'GitHub repository' })
  await expect(github.locator('svg')).toBeVisible()
  const repositoryPopup = page.waitForEvent('popup')
  await github.click()
  const repository = await repositoryPopup
  await expect(repository).toHaveURL(repositoryUrl)
  expect(await repository.evaluate(() => window.opener)).toBeNull()
  await repository.close()

  const aboutButton = header.getByRole('button', { name: 'About CanvaSlide' })
  await expect(aboutButton).toHaveAttribute('title', 'About CanvaSlide')
  await aboutButton.click()
  const about = page.getByRole('dialog', { name: 'About CanvaSlide' })
  await expect(about).toContainText('Current version')
  await expect(about.locator('dd')).toHaveText(version)
  const logo = about.getByRole('img', { name: 'CanvaSlide', exact: true })
  await expect(logo).toBeVisible()
  await expect
    .poll(() =>
      logo.evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight])
    )
    .toEqual([2172, 724])
  const imageSource = await logo.getAttribute('src')
  const imageResponse = await page.request.get(imageSource!)
  expect(await imageResponse.body()).toEqual(
    readFileSync(new URL('../../src/renderer/src/assets/canvaslide-light.png', import.meta.url))
  )
  const notes = about.getByRole('link', { name: 'Release notes' })
  await expect(notes).toHaveAttribute('href', releasesUrl)
  const releasesPopup = page.waitForEvent('popup')
  await notes.click()
  const releases = await releasesPopup
  await expect(releases).toHaveURL(releasesUrl)
  expect(await releases.evaluate(() => window.opener)).toBeNull()
  await releases.close()
  await expect(about).toBeVisible()
  await page.keyboard.press('Escape')
  await header.getByRole('button', { name: /^Settings/ }).click()
  await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Updates', exact: true })).toHaveCount(0)
})

for (const [platform, userAgent, settingsShortcut] of [
  ['macOS', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', '⌘,'],
  ['Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Ctrl+,']
]) {
  test(`K respects editing, composition and modifiers with ${platform} key conventions @webkit`, async ({
    page
  }) => {
    await page.addInitScript(
      (agent) => Object.defineProperty(navigator, 'userAgent', { get: () => agent }),
      userAgent
    )
    await page.goto('/')
    const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
    await expect(
      page.getByRole('button', { name: `Settings (${settingsShortcut})`, exact: true })
    ).toBeVisible()
    const name = page.getByRole('textbox', { name: 'Document name' })
    await name.fill('My deck')
    await name.press('End')
    await name.press('k')
    await expect(name).toHaveValue('My deckk')
    await expect(help).toHaveCount(0)
    await name.blur()

    await page.keyboard.press('t')
    await page.getByTestId('canvas-viewport').click({ position: { x: 350, y: 250 } })
    const editor = page.locator('.canvas-text-editor')
    await expect(editor).toBeFocused()
    await page.keyboard.type('kK?')
    await expect(editor).toHaveText('kK?')
    await expect(help).toHaveCount(0)
    await page.keyboard.press('Escape')

    for (const init of [
      { altKey: true },
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { isComposing: true },
      { keyCode: 229 },
      { key: 'ㅏ' }
    ]) {
      await page.locator('body').dispatchEvent('keydown', {
        key: 'k',
        code: 'KeyK',
        bubbles: true,
        cancelable: true,
        ...init
      })
      await expect(help).toHaveCount(0)
    }
    await page.evaluate(() => {
      const event = new KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true })
      event.preventDefault()
      document.body.dispatchEvent(event)
    })
    await expect(help).toHaveCount(0)
    await page.keyboard.press('Shift+/')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.keyboard.press('k')
    await expect(help).toBeVisible()
    const helpRow = help
      .locator('dl > div')
      .filter({ has: page.getByText('Keyboard shortcuts', { exact: true }) })
    await expect(helpRow.locator('dd')).toHaveText('K')
    await expect(help).toContainText('Bring forward')
    await page.keyboard.press('k')
    await expect(help).toBeVisible()
    await page.keyboard.press('Escape')
    await page.locator('body').dispatchEvent('keydown', { key: 'K', code: 'KeyK', bubbles: true })
    await expect(help).toBeVisible()
  })
}

test('K leaves modal and slide show behavior intact @webkit', async ({ page }) => {
  await page.goto('/')
  await waitForEditor(page)
  await page.keyboard.press('f')
  await dragOnCanvas(page, [200, 200], [500, 400])
  const frames = page.locator('[data-element-type="frame"]')
  await expect(frames).toHaveCount(1)
  await page.getByRole('button', { name: 'About CanvaSlide' }).click()
  const about = page.getByRole('dialog', { name: 'About CanvaSlide' })
  await page.keyboard.press('k')
  await page.keyboard.press('Delete')
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(about).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(frames).toHaveCount(1)
  await page.getByRole('button', { name: 'Slide Show', exact: true }).click()
  await expect(page.getByTestId('presentation-counter')).toContainText('1 / 1')
  await page.keyboard.press('k')
  await page.keyboard.press('Shift+/')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('banner')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

for (const locale of ['en', 'ko']) {
  test(`help and About stay legible at supported widths in ${locale} and both themes @webkit`, async ({
    page
  }) => {
    await page.addInitScript(
      (language) => localStorage.setItem('canvaslide.language', language),
      locale
    )
    await page.goto('/')
    const header = page.getByRole('banner')
    const aboutLabel = locale === 'en' ? 'About CanvaSlide' : 'CanvaSlide 정보'
    // Include the unsaved label, which competes with toolbar actions at the minimum window width.
    await header.getByRole('textbox').fill('A longer presentation title')
    await header.getByRole('textbox').blur()
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme })
      for (const width of [800, 1024, 1440]) {
        await page.setViewportSize({ width, height: 700 })
        const menu = header.getByRole('button', {
          name: locale === 'en' ? 'Actions menu' : '작업 메뉴',
          exact: true
        })
        await expect(menu).toHaveCount(width <= 1100 ? 1 : 0)
        expect(await header.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
          true
        )
        expect((await header.getByRole('textbox').boundingBox())!.width).toBeGreaterThan(60)
        const controls = await header.locator('button').evaluateAll((buttons) =>
          buttons.map((button) => {
            const rect = button.getBoundingClientRect()
            return { left: rect.left, right: rect.right, width: rect.width }
          })
        )
        for (const [index, control] of controls.entries()) {
          expect(control.width).toBeGreaterThan(20)
          expect(control.right).toBeLessThanOrEqual(width)
          if (index > 0) {
            expect(control.left).toBeGreaterThanOrEqual(controls[index - 1]!.right)
          }
        }
        if (width <= 1100) {
          await menu.click()
          await page.getByRole('menuitem', { name: aboutLabel, exact: true }).click()
        } else {
          await header.getByRole('button', { name: aboutLabel, exact: true }).click()
        }
        const about = page.getByRole('dialog', { name: aboutLabel })
        const logo = about.getByRole('img', { name: 'CanvaSlide' })
        const imageBox = (await logo.boundingBox())!
        expect(imageBox.width / imageBox.height).toBeCloseTo(3, 1)
        await expect(logo).toHaveCSS('background-color', 'rgb(255, 255, 255)')
        await expect(about.locator('dd')).toHaveText(version)
        await expect(
          about.getByRole('link', { name: locale === 'en' ? 'Release notes' : '릴리스 노트' })
        ).toBeVisible()
        await page.keyboard.press('Escape')
      }
    }
  })
}
