import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { dragOnCanvas } from './canvas-gestures'

type PdfPageReport = {
  /** Page box in points. */
  width: number
  height: number
  /** Pixel size of the one image the page draws. */
  image: { width: number; height: number }
  /** Share of that image's pixels that are not paper white. */
  ink: number
}

/**
 * Reads the export back through a real PDF reader — the same library the app imports PDFs with —
 * and decodes each page's image. `ink` is what separates a page carrying the slide from a page
 * that came out blank, which is the failure a structural check would sail straight past.
 */
async function readPdf(file: string): Promise<{ title: string; pages: PdfPageReport[] }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(file)),
    useWorkerFetch: false
  }).promise
  const pages: PdfPageReport[] = []
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number)
    const box = page.getViewport({ scale: 1 })
    const operators = await page.getOperatorList()
    const at = operators.fnArray.indexOf(pdfjs.OPS.paintImageXObject)
    expect(at, `page ${number} draws an image`).toBeGreaterThanOrEqual(0)
    const [id] = operators.argsArray[at] as [string]
    const image = await new Promise<{ width: number; height: number; data: Uint8Array }>(
      (resolve) => page.objs.get(id, resolve)
    )
    // The decoder hands back 24-bit RGB; anything below full white counts as drawn.
    let marked = 0
    for (let byte = 0; byte < image.data.length; byte += 3) {
      if (image.data[byte]! < 232 || image.data[byte + 1]! < 232 || image.data[byte + 2]! < 232) {
        marked += 1
      }
    }
    pages.push({
      width: box.width,
      height: box.height,
      image: { width: image.width, height: image.height },
      ink: marked / (image.width * image.height)
    })
  }
  const { info } = await pdf.getMetadata()
  return { title: (info as { Title?: string }).Title ?? '', pages }
}

test('exports one PDF page per frame, sized to the frame and carrying its content @webkit', async ({
  page
}) => {
  await page.goto('/')
  // A landscape frame under a shape that overhangs it on every side, then a portrait frame of text.
  await page.keyboard.press('f')
  await dragOnCanvas(page, [100, 150], [500, 375])
  await page.keyboard.press('r')
  await dragOnCanvas(page, [60, 110], [540, 415])
  await page.keyboard.type('Shape label')
  await page.keyboard.press('Escape')
  await page.keyboard.press('f')
  await dragOnCanvas(page, [700, 200], [900, 600])
  await page.keyboard.press('t')
  await page.getByTestId('canvas-viewport').click({ position: { x: 730, y: 250 } })
  await page.keyboard.type('Exported page text')
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-element-type="frame"]')).toHaveCount(2)

  await page.getByRole('button', { name: 'Share', exact: true }).click()
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Export presentation' })
  // The button the user pressed decides the format; the dialog offers no second choice.
  await expect(dialog.getByRole('heading')).toHaveText('Export as PDF')
  await expect(dialog.getByText('Image quality')).toHaveCount(0)
  await expect(dialog).toContainText('2 pages')
  // A size, not "calculating…" and not "rendering page n of m…": the dialog reports the file it
  // has actually built, so what it shows here is what the download weighs.
  await expect(dialog.getByTestId('export-size')).toContainText(/\d (B|KB|MB)$/, {
    timeout: 60_000
  })

  const downloadPromise = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export…' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.pdf$/)
  const file = join(mkdtempSync(join(tmpdir(), 'uc-pdf-')), 'deck.pdf')
  await download.saveAs(file)
  await expect(dialog).toHaveCount(0)

  const { pages } = await readPdf(file)
  expect(pages).toHaveLength(2)
  // Page boxes follow each frame's proportions: 400×225 is 16:9, 200×400 is 1:2.
  expect(pages[0]!.width / pages[0]!.height).toBeCloseTo(16 / 9, 2)
  expect(pages[1]!.width / pages[1]!.height).toBeCloseTo(1 / 2, 2)
  // Whatever a frame measures on an infinite canvas, its page gets the same long edge.
  expect(Math.max(pages[0]!.width, pages[0]!.height)).toBeCloseTo(960, 1)
  expect(Math.max(pages[1]!.width, pages[1]!.height)).toBeCloseTo(960, 1)
  // Rasterised at the default resolution: 2 px per point.
  expect(pages[0]!.image.width).toBe(Math.round(pages[0]!.width * 2))
  expect(pages[0]!.image.height).toBe(Math.round(pages[0]!.height * 2))
  // The overhanging shape covers its page corner to corner, and no further: content is laid out at
  // the page's own scale and clipped to the frame. Rendering it unscaled in a corner — which is
  // what an SVG viewBox does to `foreignObject` content in WebKit — leaves most of the page bare.
  expect(pages[0]!.ink).toBeGreaterThan(0.98)
  // The text page is mostly paper, but its text did reach the page.
  expect(pages[1]!.ink).toBeGreaterThan(0.002)
  expect(pages[1]!.ink).toBeLessThan(0.5)
})

test('leaves the PDF page honest about a deck with no frames', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Export presentation' })
  await expect(dialog).toContainText('Add at least one frame')
  await expect(dialog.getByRole('button', { name: 'Export…' })).toBeDisabled()
})
