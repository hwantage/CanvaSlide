import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, expect, type Page } from '@playwright/test'
import { exampleExportHtml } from '../example-exports.ts'
import { exportedExampleIds } from '../src/exported-examples.ts'

const root = resolve(import.meta.dirname, '../..')
const temporary = resolve(root, 'discuss/example-exports')
const output = resolve(root, 'website/public/examples')

async function settleCamera(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        const world = document.querySelector<HTMLElement>('.uc-world')!
        let last = ''
        let since = performance.now()
        const tick = () => {
          const transform = world.style.transform
          if (transform !== last) {
            last = transform
            since = performance.now()
          }
          if (performance.now() - since > 300) {
            done()
          } else {
            requestAnimationFrame(tick)
          }
        }
        requestAnimationFrame(tick)
      })
  )
}

await mkdir(temporary, { recursive: true })
const browser = await chromium.launch()
try {
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1000 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce'
  })
  for (const id of exportedExampleIds) {
    const file = resolve(temporary, `${id}.html`)
    await writeFile(file, await exampleExportHtml(id))
    await page.goto(pathToFileURL(file).href)
    await expect(page.getByTestId('presentation-counter')).toBeVisible()
    await page.getByRole('button', { name: 'Overview (O)' }).click()
    await settleCamera(page)
    await page.screenshot({ path: resolve(output, `${id}.png`), animations: 'disabled' })
    if (id === 'slides') {
      // Why nested frames are dropped: the site's overview offers whole slides, not detail views.
      const frames = await page.locator('.uc-frame').evaluateAll((elements) => {
        const rects = elements.map((element) => {
          const { x, y, width, height } = element.getBoundingClientRect()
          return { x, y, width, height }
        })
        const contains = (outer: (typeof rects)[number], inner: (typeof rects)[number]) =>
          outer.x <= inner.x &&
          outer.y <= inner.y &&
          outer.x + outer.width >= inner.x + inner.width &&
          outer.y + outer.height >= inner.y + inner.height
        // Why the index order: of two identical frames (a revisited slide) the first one stays.
        return rects.filter(
          (rect, index) =>
            !rects.some(
              (outer, other) =>
                other !== index &&
                contains(outer, rect) &&
                (!contains(rect, outer) || other < index)
            )
        )
      })
      await writeFile(
        resolve(root, 'website/src/slide-preview-frames.json'),
        `${JSON.stringify(frames, null, 2)}\n`
      )
      await page.getByRole('button', { name: 'Overview (O)' }).click()
      for (let index = 0; index < 4; index++) {
        await page.getByRole('button', { name: 'Next frame (→)' }).click()
      }
      await expect(page.getByTestId('presentation-counter')).toContainText('Pilot results')
      await settleCamera(page)
      await page.locator('.uc-frame.is-current').screenshot({
        path: resolve(output, 'slide-detail.png'),
        animations: 'disabled'
      })
    }
  }
} finally {
  await browser.close()
}
