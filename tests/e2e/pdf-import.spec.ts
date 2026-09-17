import { expect, test, type Page } from '@playwright/test'

/** Minimal two-page PDF (Letter, then landscape) built by hand so the test needs no fixture file. */
function twoPagePdf(): string {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 450] >>'
  ]
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((object, index) => {
    offsets.push(body.length)
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return body
}

async function dropPdf(page: Page, at: { x: number; y: number }) {
  await page.getByTestId('canvas-viewport').evaluate(
    (element, { source, x, y }) => {
      const file = new File([source], 'deck.pdf', { type: 'application/pdf' })
      const data = new DataTransfer()
      data.items.add(file)
      const rect = element.getBoundingClientRect()
      const init = {
        dataTransfer: data,
        bubbles: true,
        cancelable: true,
        clientX: rect.left + x,
        clientY: rect.top + y
      }
      element.dispatchEvent(new DragEvent('dragover', init))
      element.dispatchEvent(new DragEvent('drop', init))
    },
    { source: twoPagePdf(), ...at }
  )
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('canvas-viewport')).toBeVisible()
})

test('dropping a PDF adds one image and one frame per page, laid out as a grid', async ({
  page
}) => {
  await dropPdf(page, { x: 100, y: 100 })
  const images = page.locator('[data-element-type="image"]')
  const frames = page.locator('[data-element-type="frame"]')
  await expect(images).toHaveCount(2, { timeout: 15_000 })
  await expect(frames).toHaveCount(2)
  // Pages scale to the default frame width; the second page is landscape.
  await expect
    .poll(() => images.nth(0).evaluate((el) => el.getBoundingClientRect().width))
    .toBeCloseTo(960, 3)
  await expect
    .poll(() => images.nth(1).evaluate((el) => el.getBoundingClientRect().height))
    .toBeCloseTo(540, 3)
  // Why: Chromium rounds synthetic event coordinates to whole pixels; allow sub-pixel drift.
  const viewport = (await page.getByTestId('canvas-viewport').boundingBox())!
  const position = (index: number) =>
    images.nth(index).evaluate((el, origin) => {
      const bounds = el.getBoundingClientRect()
      return [bounds.x - origin.x, bounds.y - origin.y]
    }, viewport)
  const [firstLeft, firstTop] = await position(0)
  const [secondLeft, secondTop] = await position(1)
  expect(Math.abs((firstLeft ?? 0) - 100)).toBeLessThan(1)
  expect(Math.abs((firstTop ?? 0) - 100)).toBeLessThan(1)
  expect(Math.abs((secondLeft ?? 0) - 1140)).toBeLessThan(1)
  expect(Math.abs((secondTop ?? 0) - 100)).toBeLessThan(1)
  await expect(frames.nth(0)).toHaveCSS('width', '960px')
  const rows = page.getByTestId('frame-row')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('deck 1')
  await expect(rows.nth(1)).toContainText('deck 2')
  // The frames are selected and the whole import is a single undo step.
  await expect(page.getByRole('heading', { name: '2 elements' })).toBeVisible()
  const isMac = await page.evaluate(() => /Mac/.test(navigator.userAgent))
  await page.keyboard.press(`${isMac ? 'Meta' : 'Control'}+z`)
  await expect(images).toHaveCount(0)
  await expect(frames).toHaveCount(0)
})

test('the toolbar import button opens a file chooser for images and PDFs', async ({ page }) => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
    'base64'
  )
  const chooser = page.waitForEvent('filechooser')
  await page.getByTestId('import-files').click()
  await (
    await chooser
  ).setFiles([
    { name: 'dot.png', mimeType: 'image/png', buffer: png },
    { name: 'deck.pdf', mimeType: 'application/pdf', buffer: Buffer.from(twoPagePdf()) }
  ])
  await expect(page.locator('[data-element-type="image"]')).toHaveCount(3, { timeout: 15_000 })
  await expect(page.locator('[data-element-type="frame"]')).toHaveCount(2)
  await expect(page.getByTestId('frame-row').nth(1)).toContainText('deck 2')
})
