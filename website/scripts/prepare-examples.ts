import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, expect, type Page } from '@playwright/test'
import { buildStandaloneHtml } from '../../src/shared/canvas/html-export.ts'
import type { CanvasDocument } from '../../src/shared/canvas/element-types.ts'

const root = resolve(import.meta.dirname, '../..')
const output = resolve(root, 'website/public/examples')
const playerScript = await readFile(
  resolve(root, 'src/renderer/src/generated/player.iife.js'),
  'utf8'
)
const examples = [
  { id: 'flowchart', source: 'flowchart/order-fulfillment' },
  { id: 'erd', source: 'erd/shop-schema' },
  { id: 'slides', source: 'slides/northwind-launch-deck' }
] as const

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

await mkdir(output, { recursive: true })
const browser = await chromium.launch()
try {
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1000 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce'
  })
  for (const example of examples) {
    const document = JSON.parse(
      await readFile(resolve(root, `examples/${example.source}.canvas.json`), 'utf8')
    ) as CanvasDocument
    const file = resolve(output, `${example.id}.html`)
    await writeFile(file, buildStandaloneHtml({ document, playerScript }))
    await page.goto(pathToFileURL(file).href)
    await expect(page.getByTestId('presentation-counter')).toBeVisible()
    await page.getByRole('button', { name: 'Overview (O)' }).click()
    await settleCamera(page)
    await page.screenshot({ path: resolve(output, `${example.id}.png`), animations: 'disabled' })
    if (example.id === 'slides') {
      const frames = await page.locator('.uc-frame').evaluateAll((elements) =>
        elements.map((element) => {
          const { x, y, width, height } = element.getBoundingClientRect()
          return { x, y, width, height }
        })
      )
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
