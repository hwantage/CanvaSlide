import { expect, test, type Page } from '@playwright/test'
import { dragOnCanvas } from './canvas-gestures'

async function addFrame(page: Page) {
  await page.keyboard.press('f')
  await dragOnCanvas(page, [150, 150], [550, 350])
}

async function captureCopiedLinks(page: Page) {
  const copied: string[] = []
  await page.exposeFunction('recordCopiedLink', (text: string) => copied.push(text))
  await page.addInitScript(() => {
    const record = (window as unknown as { recordCopiedLink: (text: string) => Promise<void> })
      .recordCopiedLink
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: record,
        write: async (items: ClipboardItem[]) => {
          await record(await (await items[0]!.getType('text/plain')).text())
        }
      }
    })
  })
  return copied
}

for (const theme of ['light', 'dark'] as const) {
  test(`share modes remain readable when hovered before and after selection in ${theme} @webkit`, async ({
    page
  }) => {
    await page.emulateMedia({ colorScheme: theme })
    await page.goto('/')
    await page.addStyleTag({ content: '* { transition: none !important; }' })
    await page.getByRole('button', { name: 'Share', exact: true }).click()
    const radios = page.getByRole('dialog', { name: 'Share', exact: true }).getByRole('radio')
    for (const selected of [0, 1]) {
      await radios.nth(selected).check()
      for (const index of [0, 1]) {
        const radio = radios.nth(index)
        await radio.hover()
        await expect(radio).toHaveCSS('cursor', 'default')
        await expect
          .poll(() =>
            radio.evaluate((input) => {
              const label = input.nextElementSibling!
              let surface: Element | null = label
              let background = 'rgba(0, 0, 0, 0)'
              while (surface && background === 'rgba(0, 0, 0, 0)') {
                background = getComputedStyle(surface).backgroundColor
                surface = surface.parentElement
              }
              const luminance = (color: string) => {
                const channels = color
                  .match(/[\d.]+/g)!
                  .slice(0, 3)
                  .map(Number)
                return channels.reduce((sum, channel, i) => {
                  const value = channel / 255
                  const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
                  return sum + linear * [0.2126, 0.7152, 0.0722][i]!
                }, 0)
              }
              const text = luminance(getComputedStyle(label).color)
              const fill = luminance(background)
              return (Math.max(text, fill) + 0.05) / (Math.min(text, fill) + 0.05)
            })
          )
          .toBeGreaterThanOrEqual(4.5)
        await expect(radios.nth(selected)).toBeChecked()
      }
    }
  })
}

test('one copy click publishes the chosen mode, reuses the link, and resets it when access changes @webkit', async ({
  page
}) => {
  const copied = await captureCopiedLinks(page)
  const modes: string[] = []
  await page.route('**/api/share', async (route) => {
    modes.push(route.request().postDataJSON().access)
    await route.fulfill({
      json: { id: `abcdefghijklmnopqr_${modes.length.toString().padStart(2, '0')}` }
    })
  })
  await page.goto('/')
  await addFrame(page)
  await expect(
    page.getByRole('banner').getByRole('button', { name: 'Export', exact: true })
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  const share = page.getByRole('dialog', { name: 'Share', exact: true })
  const radios = share.getByRole('radio')
  await expect(radios.nth(0)).toHaveAccessibleName('View slide show only')
  await expect(radios.nth(0)).toBeChecked()
  await expect(radios.nth(1)).toHaveAccessibleName('Edit a copy')
  const left = (await radios.nth(0).boundingBox())!
  const right = (await radios.nth(1).boundingBox())!
  expect(right.x).toBeGreaterThan(left.x + left.width)
  expect(right.y).toBe(left.y)
  const copy = share.getByRole('button', { name: 'Copy link', exact: true })
  await copy.hover()
  await expect(copy).toHaveCSS('cursor', 'pointer')
  const copyBox = (await copy.boundingBox())!
  expect(copyBox.y).toBeGreaterThan(left.y + left.height)
  expect(copyBox.width).toBeGreaterThan(left.width + right.width)
  await copy.click()
  await expect(share.getByRole('status')).toHaveText('Link copied.')
  const original = await share.getByRole('textbox', { name: 'Shareable URL' }).inputValue()
  expect(copied).toEqual([original])
  expect(modes).toEqual(['present'])
  await copy.click()
  await expect.poll(() => copied).toEqual([original, original])
  expect(modes).toEqual(['present'])
  await radios.nth(1).check()
  await expect(share.getByRole('textbox')).toHaveCount(0)
  await expect(share.getByRole('status')).toBeEmpty()
  await copy.click()
  await expect(share.getByRole('status')).toHaveText('Link copied.')
  const editable = await share.getByRole('textbox', { name: 'Shareable URL' }).inputValue()
  expect(editable).not.toBe(original)
  expect(copied.at(-1)).toBe(editable)
  expect(modes).toEqual(['present', 'edit'])
  for (const label of ['Export .canvaslide', 'Export PDF', 'Export HTML']) {
    const button = share.getByRole('button', { name: label, exact: true })
    await button.hover()
    await expect(button).toHaveCSS('cursor', 'pointer')
    const box = (await button.boundingBox())!
    expect(box.y).toBeGreaterThan(copyBox.y + copyBox.height)
  }
})

test('closing during upload aborts copying and reopening restores slideshow sharing @webkit', async ({
  page
}) => {
  const copied = await captureCopiedLinks(page)
  let finish!: () => void
  const pending = new Promise<void>((resolve) => {
    finish = resolve
  })
  const started = page.waitForRequest('**/api/share')
  await page.route('**/api/share', async (route) => {
    await pending
    await route.fulfill({ json: { id: 'abcdefghijklmnopqr_01' } }).catch(() => {})
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  const share = page.getByRole('dialog', { name: 'Share', exact: true })
  await expect(share.getByRole('status')).toBeEmpty()
  await expect(share.getByRole('button', { name: 'Copy link', exact: true })).toBeDisabled()
  await expect(share.getByRole('button', { name: 'Copy link', exact: true })).toHaveCSS(
    'cursor',
    'default'
  )
  await share.getByRole('radio', { name: 'Edit a copy', exact: true }).check()
  await share.getByRole('button', { name: 'Copy link', exact: true }).click()
  await started
  await expect(share.getByRole('button', { name: 'Copying link…' })).toBeDisabled()
  await expect(share.getByRole('status')).toHaveText('Copying link…')
  for (const name of ['Copying link…', 'Export .canvaslide', 'Export PDF', 'Export HTML']) {
    await expect(share.getByRole('button', { name, exact: true })).toHaveCSS('cursor', 'default')
  }
  await expect(
    share.getByRole('radio', { name: 'View slide show only', exact: true })
  ).toBeDisabled()
  await page.keyboard.press('Escape')
  finish()
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  await expect(
    share.getByRole('radio', { name: 'View slide show only', exact: true })
  ).toBeChecked()
  await expect(share.getByRole('textbox')).toHaveCount(0)
  expect(copied).toEqual([])
})
