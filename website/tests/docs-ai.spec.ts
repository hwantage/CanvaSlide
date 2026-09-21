import { expect, test } from '@playwright/test'

const labels = {
  en: {
    example: 'Example prompt · Introducing CanvaSlide',
    general: 'General',
    dynamic: 'Dynamic',
    html: 'Generate an HTML file',
    copy: 'Copy prompt',
    copied: 'Prompt copied.',
    skill: 'View the authoring skill',
    calm: 'calm layouts',
    zoom: 'nested frames',
    requestHtml: 'Also create an HTML file.'
  },
  ko: {
    example: '예시 프롬프트 · CanvaSlide 소개',
    general: '일반',
    dynamic: '다이나믹',
    html: 'HTML 파일 생성하기',
    copy: '프롬프트 복사',
    copied: '프롬프트를 복사했습니다.',
    skill: '파일 제작 스킬 보기',
    calm: '차분한 배치',
    zoom: '내부 프레임',
    requestHtml: 'HTML 파일로도 만들어줘.'
  }
}

for (const lang of ['en', 'ko'] as const) {
  test(`AI guide copies the selected style and output request in ${lang}`, async ({
    page,
    context
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto(`./docs/?guide=ai&lang=${lang}`)
    const text = labels[lang]
    const prompt = page.getByRole('textbox', { name: text.example })
    const status = page.locator('.docs-ai-prompt [role="status"]')
    const copy = page.getByRole('button', { name: text.copy, exact: true })
    await expect(page.getByRole('radio', { name: text.general, exact: true })).toBeChecked()
    await expect(prompt).toHaveValue(new RegExp(text.calm))
    await expect(prompt).toHaveValue(/canvaslide-introduction\.canvaslide/)
    const skill = page.getByRole('link', { name: text.skill })
    await expect(skill).toHaveAttribute(
      'href',
      'https://github.com/hwantage/CanvaSlide/blob/main/skills/canvaslide/SKILL.md'
    )
    expect(await prompt.inputValue()).toContain(await skill.getAttribute('href'))
    await copy.click()
    await expect(status).toContainText(text.copied)
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      await prompt.inputValue()
    )

    await page.getByRole('radio', { name: text.general, exact: true }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('radio', { name: text.dynamic, exact: true })).toBeChecked()
    await expect(prompt).toHaveValue(new RegExp(text.zoom))
    await expect(prompt).toHaveValue(/8/)
    await expect(status).toBeEmpty()
    await page.getByRole('checkbox', { name: text.html }).check()
    expect(await prompt.inputValue()).toContain(text.requestHtml)
    await copy.click()
    await expect(status).toContainText(text.copied)
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      await prompt.inputValue()
    )

    await page.getByRole('checkbox', { name: text.html }).uncheck()
    expect(await prompt.inputValue()).not.toContain(text.requestHtml)
    await expect(status).toBeEmpty()
    await copy.click()
    await expect(status).toContainText(text.copied)

    const nextLang = lang === 'en' ? 'ko' : 'en'
    await page.locator(`.language-switch button[lang="${nextLang}"]`).click()
    const translatedPrompt = page.getByRole('textbox', { name: labels[nextLang].example })
    await expect(translatedPrompt).toHaveValue(new RegExp(labels[nextLang].zoom))
    await expect(status).toBeEmpty()
    await page.getByRole('button', { name: labels[nextLang].copy, exact: true }).click()
    await expect(status).toContainText(labels[nextLang].copied)
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      await translatedPrompt.inputValue()
    )
  })

  test(`AI prompt fits a narrow screen in ${lang}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 900 })
    await page.emulateMedia({ colorScheme: lang === 'ko' ? 'dark' : 'light' })
    await page.goto(`./docs/?guide=ai&lang=${lang}`)
    await page.getByRole('radio', { name: labels[lang].dynamic, exact: true }).check()
    await page.getByRole('checkbox', { name: labels[lang].html }).check()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    await expect(page.getByRole('button', { name: labels[lang].copy, exact: true })).toBeVisible()
    await page.locator('.docs-ai-prompt').scrollIntoViewIfNeeded()
    await testInfo.attach(`ai-guide-${lang}-mobile`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    })
  })
}

test('AI guide keeps the prompt selectable when clipboard access is denied', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw new Error('Permission denied')
        }
      }
    })
  })
  await page.goto('./docs/?guide=ai&lang=en')
  await page.getByRole('button', { name: 'Copy prompt', exact: true }).click()
  await expect(page.getByRole('status')).toContainText(
    'Select the prompt above and copy it manually'
  )
  const prompt = page.getByRole('textbox', { name: labels.en.example })
  await prompt.selectText()
  expect(
    await prompt.evaluate((element: HTMLTextAreaElement) =>
      element.value.slice(element.selectionStart, element.selectionEnd)
    )
  ).toBe(await prompt.inputValue())
})
