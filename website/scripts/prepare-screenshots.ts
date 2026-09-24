import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

const root = resolve(import.meta.dirname, '../..')
const output = resolve(root, 'website/public/images')
const server = await createServer({
  configFile: resolve(root, 'config/vite.config.ts'),
  server: { port: 0, strictPort: false },
  logLevel: 'warn'
})
await server.listen()
const baseURL = server.resolvedUrls?.local[0]
if (!baseURL) {
  throw new Error('The editor dev server has no local URL')
}
const browser = await chromium.launch()
try {
  const page = await browser.newPage({
    baseURL,
    viewport: { width: 1400, height: 900 },
    locale: 'en-US',
    colorScheme: 'light',
    reducedMotion: 'reduce'
  })
  await page.goto('./?example=slides')
  await expect(page.getByRole('textbox', { name: 'Document name' })).toHaveValue(
    'Northwind Launch Deck',
    { timeout: 30_000 }
  )
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: resolve(output, 'editor.png'), animations: 'disabled' })
  await page.getByRole('button', { name: 'Slide Show', exact: true }).click()
  await expect(page.getByTestId('presentation-counter')).toContainText('1 / ')
  // Why poll: the slideshow opens on the whole canvas and only then moves to the first frame.
  const world = page.getByTestId('world-layer')
  let settled = ''
  await expect
    .poll(
      async () => {
        const transform = await world.evaluate((element) => element.style.transform)
        const stable = transform === settled
        settled = transform
        return stable
      },
      { intervals: [500] }
    )
    .toBe(true)
  // Why the bottom edge: controls start hidden and only that edge or Tab reveals them.
  await page.mouse.move(10, 896)
  await expect(page.getByTestId('presentation-controls')).toBeVisible()
  await page.screenshot({ path: resolve(output, 'present.png'), animations: 'disabled' })
} finally {
  await browser.close()
  await server.close()
}
