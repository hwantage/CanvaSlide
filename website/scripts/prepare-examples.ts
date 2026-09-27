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

async function namedFrames(page: Page, names: string[]) {
  return page.locator('.uc-frame').evaluateAll(
    (elements, names) =>
      names.map((name) => {
        const frame = elements.find(
          (element) => element.querySelector('.uc-frame-label span')?.textContent === name
        )
        if (!frame) {
          throw new Error(`Missing example frame: ${name}`)
        }
        const { x, y, width, height } = frame.getBoundingClientRect()
        return { x, y, width, height }
      }),
    names
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
      const storyFrames = await namedFrames(page, ['Pilot results', '91%'])
      await writeFile(
        resolve(root, 'website/src/slide-story-frames.json'),
        `${JSON.stringify(storyFrames, null, 2)}\n`
      )
      // Render the original DOM at 6× density: this slide fills more than 2,000 CSS pixels
      // when the website zooms into its nested frame, including on Retina displays.
      const detailPage = await browser.newPage({
        viewport: { width: 1400, height: 1000 },
        deviceScaleFactor: 6,
        reducedMotion: 'reduce'
      })
      await detailPage.goto(pathToFileURL(file).href)
      for (let index = 0; index < 4; index++) {
        await detailPage.getByRole('button', { name: 'Next frame (→)' }).click()
      }
      await expect(detailPage.getByTestId('presentation-counter')).toContainText('Pilot results')
      await settleCamera(detailPage)
      await detailPage.locator('.uc-frame.is-current').screenshot({
        path: resolve(output, 'slide-detail.png'),
        animations: 'disabled'
      })
      await detailPage.close()
    }
  }
  const architectureFile = resolve(temporary, 'architecture.html')
  await writeFile(architectureFile, await exampleExportHtml('architecture'))
  const architecturePage = await browser.newPage({
    viewport: { width: 1400, height: 1000 },
    deviceScaleFactor: 4,
    reducedMotion: 'reduce'
  })
  await architecturePage.goto(pathToFileURL(architectureFile).href)
  await architecturePage.getByRole('button', { name: 'Overview (O)' }).click()
  await settleCamera(architecturePage)
  await architecturePage.screenshot({
    path: resolve(output, 'architecture.png'),
    animations: 'disabled'
  })
  await writeFile(
    resolve(root, 'website/src/architecture-preview-frames.json'),
    `${JSON.stringify(await namedFrames(architecturePage, ['Edge', 'Services', 'Data']), null, 2)}\n`
  )
  await architecturePage.close()
} finally {
  await browser.close()
}
