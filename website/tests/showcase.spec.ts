import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { expect, test } from '@playwright/test'

test('the overview opens any slide, continues the sequence, and returns to the whole story', async ({
  page
}) => {
  await page.goto('./')
  const demo = page.locator('.overview-demo')
  await demo.getByRole('button', { name: 'View slide 3: The problem', exact: true }).click()
  await expect(demo).toHaveAttribute('data-scene', '3')
  await expect(demo.locator('.overview-current')).toContainText('3 / 6')
  await demo.getByRole('button', { name: 'Next slide', exact: true }).click()
  await expect(demo).toHaveAttribute('data-scene', '4')
  await demo.getByRole('region').focus()
  await page.keyboard.press('Escape')
  await expect(demo).toHaveAttribute('data-scene', '0')
  await expect(demo.getByRole('button', { name: 'All slides', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await demo.getByRole('button', { name: 'View slide 6: Roadmap', exact: true }).click()
  await expect(demo.getByRole('button', { name: 'Next slide', exact: true })).toBeDisabled()
  await demo.getByRole('button', { name: 'All slides', exact: true }).click()
  await expect(demo.getByRole('button', { name: /View slide/ })).toHaveCount(6)
  await page.locator('.overview-copy').getByRole('link').click()
  await expect(page).toHaveURL(/guide=frames#whole-story/)
  await expect(page.locator('#whole-story')).toContainText('Click a frame')
})

test('example tabs support the keyboard and open working HTML presentations', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('tab', { name: 'Flowcharts', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'ER diagrams' })).toBeFocused()
  await expect(page.getByRole('tab', { name: 'ER diagrams' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(page.getByRole('tabpanel')).toContainText('See how it all connects.')
  await page.keyboard.press('End')
  await expect(page.getByRole('tab', { name: 'Presentation slides' })).toBeFocused()
  await page.keyboard.press('Home')
  await expect(page.getByRole('tab', { name: 'Flowcharts' })).toBeFocused()

  for (const [label, title, count] of [
    ['Flowcharts', 'Order Fulfillment Flow', 3],
    ['ER diagrams', 'Shop Schema', 4],
    ['Presentation slides', 'Northwind Launch Deck', 6]
  ] as const) {
    await page.getByRole('tab', { name: label, exact: true }).click()
    const popupEvent = page.waitForEvent('popup')
    await page.locator('.example-copy').getByRole('link', { name: 'Open the live example' }).click()
    const popup = await popupEvent
    await expect(popup).toHaveTitle(new RegExp(title))
    await expect(popup.getByTestId('presentation-counter')).toContainText(`1 / ${count}`)
    await popup.getByRole('button', { name: 'Next frame (→)' }).click()
    await expect(popup.getByTestId('presentation-counter')).toContainText(`2 / ${count}`)
    await popup.close()
  }
})

test('a downloaded HTML file plays from disk with the network offline', async ({
  page,
  browser
}, testInfo) => {
  await page.goto('./')
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Try a real HTML export' }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toBe('canvaslide-presentation.html')
  const file = testInfo.outputPath(download.suggestedFilename())
  await download.saveAs(file)
  const html = await readFile(file, 'utf8')
  expect(html).toContain('id="canvas-document"')
  expect(html).not.toMatch(/<(?:script|link)[^>]+(?:src|href)=["']https?:/)
  const context = await browser.newContext({ offline: true })
  const requests: string[] = []
  const errors: string[] = []
  context.on('request', (request) => {
    if (/^https?:/.test(request.url())) {
      requests.push(request.url())
    }
  })
  const player = await context.newPage()
  player.on('pageerror', (error) => errors.push(error.message))
  await player.goto(pathToFileURL(file).href)
  await expect(player.getByTestId('presentation-counter')).toContainText('1 / 6')
  await player.keyboard.press('ArrowRight')
  await expect(player.getByTestId('presentation-counter')).toContainText('2 / 6')
  await player.getByRole('button', { name: 'Overview (O)' }).click()
  await expect(player.getByRole('button', { name: 'Overview (O)' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  expect(requests).toEqual([])
  expect(errors).toEqual([])
  await context.close()
})

test('one slide zooms into a detail and returns to the whole slide', async ({ page }) => {
  await page.goto('./')
  const demo = page.locator('.detail-demo')
  const scale = () =>
    demo
      .locator('.detail-world')
      .evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a)
  await demo.scrollIntoViewIfNeeded()
  const original = await scale()
  await demo.getByRole('button', { name: 'One detail', exact: true }).click()
  await expect(demo).toHaveAttribute('data-scene', '2')
  await expect.poll(scale).toBeGreaterThan(original * 1.8)
  await demo.getByRole('region').focus()
  await page.keyboard.press('Escape')
  await expect(demo).toHaveAttribute('data-scene', '0')
  await expect.poll(scale).toBeCloseTo(original, 4)
  await page.keyboard.press('ArrowRight')
  await expect(demo.getByRole('button', { name: 'Inside the chart' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await page.keyboard.press('ArrowLeft')
  await expect(demo.getByRole('button', { name: 'Whole slide' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await demo.getByRole('region').press('Tab')
  await page.locator('.detail-copy').getByRole('link').click()
  await expect(page).toHaveURL(/guide=frames#detail-frames/)
  await expect(page.locator('#detail-frames')).toContainText('no need to duplicate the slide')
})
