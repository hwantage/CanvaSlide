import { expect, test } from '@playwright/test'
import { primaryModifier } from './canvas-gestures'

for (const locale of ['en', 'ko']) {
  test(`AI guide copies the complete ${locale} prompt and offers honest failure feedback @core-interaction`, async ({
    page
  }) => {
    await page.addInitScript((language) => {
      localStorage.setItem('canvaslide.language', language)
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            sessionStorage.setItem('copied-prompt', text)
          }
        }
      })
    }, locale)
    await page.goto('/')
    const label = locale === 'en' ? 'Create with AI' : 'AI와 함께 만들기'
    const header = page.getByRole('banner')
    const buttons = await header
      .getByRole('button')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')))
    const index = buttons.indexOf(label)
    expect(index).toBeGreaterThan(-1)
    expect(buttons[index + 1]).toBe(
      locale === 'en' ? 'Keyboard shortcuts (K)' : '키보드 단축키 (K)'
    )
    const opener = header.getByRole('button', { name: label, exact: true })
    await opener.click()
    const dialog = page.getByRole('dialog')
    const prompt = dialog.getByRole('textbox')
    const copy = dialog.getByRole('button', {
      name: locale === 'en' ? 'Copy prompt' : '프롬프트 복사',
      exact: true
    })
    const styles = dialog.getByRole('radiogroup', {
      name: locale === 'en' ? 'Presentation style' : '발표 스타일'
    })
    const html = dialog.getByRole('checkbox', {
      name: locale === 'en' ? 'Generate an HTML file' : 'HTML 파일 생성하기'
    })
    await expect(html).not.toBeChecked()
    await expect(styles.getByRole('radio')).toHaveCount(2)
    let content = ''
    for (const style of ['general', 'dynamic']) {
      const option = styles.getByRole('radio', {
        name:
          style === 'general'
            ? locale === 'en'
              ? 'General'
              : '일반'
            : locale === 'en'
              ? 'Dynamic'
              : '다이나믹',
        exact: true
      })
      if (style === 'dynamic') {
        await styles.getByRole('radio').first().focus()
        await page.keyboard.press('ArrowRight')
        await expect(option).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(prompt).toBeFocused()
        await page.keyboard.press('Shift+Tab')
        await expect(option).toBeFocused()
        await page.keyboard.press('ArrowLeft')
        await expect(styles.getByRole('radio').first()).toBeChecked()
        await page.keyboard.press('ArrowRight')
      }
      await expect(option).toBeChecked()
      await expect(dialog.getByRole('status')).toBeEmpty()
      content = await prompt.inputValue()
      expect(content.length).toBeLessThan(800)
      expect(content).toContain('canvaslide-introduction.canvaslide')
      expect(content).not.toContain('HTML')
      expect(content).toContain('https://hwantage.github.io/CanvaSlide/')
      expect(content).toContain(
        'https://github.com/hwantage/CanvaSlide/blob/main/skills/canvaslide/SKILL.md'
      )
      expect(content).toContain(locale === 'en' ? 'editable' : '편집 가능한 한국어')
      expect(content.split('\n\n')).toHaveLength(3)
      expect(content).toContain(
        style === 'general'
          ? locale === 'en'
            ? 'restrained camera movement'
            : '차분한 배치와 절제된 카메라 이동'
          : locale === 'en'
            ? 'nested frames'
            : '내부 프레임'
      )
      expect(content).toContain(
        style === 'general'
          ? locale === 'en'
            ? '8-slide English'
            : '8장 분량'
          : locale === 'en'
            ? '8 scenes'
            : '전체 발표 순서는 8장면'
      )
      await copy.click()
      await expect(dialog.getByRole('status')).toContainText(
        locale === 'en' ? 'Prompt copied.' : '프롬프트를 복사했습니다.'
      )
      expect(await page.evaluate(() => sessionStorage.getItem('copied-prompt'))).toBe(content)
      await html.focus()
      await page.keyboard.press('Space')
      await expect(html).toBeChecked()
      await expect(dialog.getByRole('status')).toBeEmpty()
      const htmlPrompt = `${content}\n\n${locale === 'en' ? 'Also create an HTML file.' : 'HTML 파일로도 만들어줘.'}`
      await expect(prompt).toHaveValue(htmlPrompt)
      await copy.click()
      await expect(dialog.getByRole('status')).toContainText(
        locale === 'en' ? 'Prompt copied.' : '프롬프트를 복사했습니다.'
      )
      expect(await page.evaluate(() => sessionStorage.getItem('copied-prompt'))).toBe(htmlPrompt)
      await html.uncheck()
      await expect(prompt).toHaveValue(content)
      await expect(dialog.getByRole('status')).toBeEmpty()
    }
    await page.evaluate(() => {
      navigator.clipboard.writeText = async () => {
        throw new Error('denied')
      }
    })
    await copy.click()
    await expect(dialog.getByRole('status')).toContainText(
      locale === 'en' ? 'Could not copy.' : '복사하지 못했습니다.'
    )
    await prompt.focus()
    await prompt.evaluate((element: HTMLTextAreaElement) => element.select())
    expect(
      await prompt.evaluate(
        (element: HTMLTextAreaElement) => element.selectionEnd - element.selectionStart
      )
    ).toBe(content.length)
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize({ width: 800, height: 500 })
      const box = (await prompt.boundingBox())!
      expect(box.x).toBeGreaterThan(0)
      expect(box.x + box.width).toBeLessThan(800)
      expect(await prompt.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true
      )
      await expect(copy).toBeInViewport()
    }
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 1440, height: 900 })
    await opener.click()
    await expect(page.getByRole('status')).toBeEmpty()
    await expect(styles.getByRole('radio').first()).toBeChecked()
    await expect(html).not.toBeChecked()
  })
}

test('pointer dismissal leaves the AI icon unchanged while keyboard dismissal restores visible focus @core-interaction', async ({
  page,
  browserName
}) => {
  await page.goto('/')
  const opener = page.getByRole('button', { name: 'Create with AI', exact: true })
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme })
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    for (const close of ['button', 'backdrop']) {
      await opener.click()
      // Focusing the copyable text must not leave a ring on a pointer-opened toolbar button.
      await page.getByRole('dialog').getByRole('textbox').click()
      await (close === 'button'
        ? page.getByRole('button', { name: 'Close AI guide', exact: true }).click()
        : page.mouse.click(10, 100))
      await page.mouse.move(700, 700)
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(opener).toHaveCSS('box-shadow', 'none')
      await expect(opener).toHaveAttribute('aria-pressed', 'false')
    }
    // Safari includes buttons in keyboard navigation with Option+Tab on macOS.
    const tab = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab'
    await page.getByRole('banner').getByRole('textbox').focus()
    await page.keyboard.press(tab)
    await expect(opener).toBeFocused()
    await expect(opener).not.toHaveCSS('box-shadow', 'none')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Escape')
    await expect(opener).toBeFocused()
    await expect(opener).not.toHaveCSS('box-shadow', 'none')
    // Tab navigation still paints the focus ring when returning to the icon.
    await page.keyboard.press(tab)
    await page.keyboard.press(`Shift+${tab}`)
    await expect(opener).toBeFocused()
    await expect(opener).not.toHaveCSS('box-shadow', 'none')
    await page.getByTestId('canvas-viewport').click({ position: { x: 650, y: 600 } })
  }
})

test('changing style and HTML during a pending copy does not announce the new prompt as copied @core-interaction', async ({
  page
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) =>
          new Promise<void>((resolve) => {
            window.addEventListener(
              'finish-copy',
              () => {
                sessionStorage.setItem('copied-prompt', text)
                resolve()
              },
              { once: true }
            )
          })
      }
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Create with AI', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const original = await dialog.getByRole('textbox').inputValue()
  await dialog.getByRole('button', { name: 'Copy prompt', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Copying…', exact: true })).toBeDisabled()
  await dialog.getByRole('radio', { name: 'Dynamic', exact: true }).click()
  await page.evaluate(() => window.dispatchEvent(new Event('finish-copy')))
  await expect(dialog.getByRole('button', { name: 'Copy prompt', exact: true })).toBeEnabled()
  await expect(dialog.getByRole('status')).toBeEmpty()
  expect(await page.evaluate(() => sessionStorage.getItem('copied-prompt'))).toBe(original)
  await expect(dialog.getByRole('textbox')).not.toHaveValue(original)
  const dynamic = await dialog.getByRole('textbox').inputValue()
  await dialog.getByRole('button', { name: 'Copy prompt', exact: true }).click()
  await dialog.getByRole('checkbox').check()
  await page.evaluate(() => window.dispatchEvent(new Event('finish-copy')))
  await expect(dialog.getByRole('button', { name: 'Copy prompt', exact: true })).toBeEnabled()
  await expect(dialog.getByRole('status')).toBeEmpty()
  expect(await page.evaluate(() => sessionStorage.getItem('copied-prompt'))).toBe(dynamic)
  await expect(dialog.getByRole('textbox')).toHaveValue(`${dynamic}\n\nAlso create an HTML file.`)
})

for (const systemLocale of ['ko-KR', 'ja-JP']) {
  test.describe(`AI guide in ${systemLocale}`, () => {
    test.use({ locale: systemLocale })
    test('uses supported system language or English fallback and follows settings @core-interaction', async ({
      page
    }) => {
      await page.goto('/')
      const korean = systemLocale === 'ko-KR'
      await page
        .getByRole('button', {
          name: korean ? 'AI와 함께 만들기' : 'Create with AI',
          exact: true
        })
        .click()
      await expect(page.getByRole('dialog').getByRole('textbox')).toHaveValue(
        korean ? /편집 가능한 한국어/ : /editable 8-slide English/
      )
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: korean ? /^설정/ : /^Settings/ }).click()
      await page
        .getByRole('dialog')
        .getByRole('radio', { name: korean ? 'English' : '한국어', exact: true })
        .click()
      await page.keyboard.press('Escape')
      await page
        .getByRole('button', {
          name: korean ? 'Create with AI' : 'AI와 함께 만들기',
          exact: true
        })
        .click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByRole('textbox')).toHaveValue(
        korean ? /editable 8-slide English/ : /편집 가능한 한국어/
      )
      await dialog
        .getByRole('radio', { name: korean ? 'Dynamic' : '다이나믹', exact: true })
        .click()
      await expect(dialog.getByRole('textbox')).toHaveValue(
        korean ? /editable English/ : /편집 가능한 한국어/
      )
    })
  })
}

test('AI guide preserves edits, selection and undo while blocking canvas commands @core-interaction', async ({
  page
}) => {
  await page.goto('/')
  const modifier = await primaryModifier(page)
  await page.keyboard.press('t')
  await page.getByTestId('canvas-viewport').click({ position: { x: 350, y: 250 } })
  await page.keyboard.type('Keep this edit')
  await page.getByRole('button', { name: 'Create with AI', exact: true }).click()
  await expect(page.locator('[data-element-type="text"]')).toHaveText('Keep this edit')
  await page.keyboard.press('Delete')
  await page.keyboard.press('k')
  await page.keyboard.press(`${modifier}+z`)
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await page.keyboard.press('Escape')
  const text = page.locator('[data-element-type="text"]')
  await expect(text).toHaveText('Keep this edit')
  // Delete still targets the selected text after closing; undo restores its committed content.
  await page.keyboard.press('Delete')
  await expect(text).toHaveCount(0)
  await page.keyboard.press(`${modifier}+z`)
  await expect(text).toHaveText('Keep this edit')
})
