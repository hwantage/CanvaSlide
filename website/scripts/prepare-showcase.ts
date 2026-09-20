import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, expect } from '@playwright/test'
import { exampleCatalog } from '../../src/shared/example-catalog.ts'
import { createServer } from 'vite'
import type { ParseDocumentResult } from '../../src/shared/canvas/document-file.ts'
import { buildStandaloneHtml } from '../../src/shared/canvas/html-export.ts'

const root = resolve(import.meta.dirname, '../..')
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom'
})
const { parseDocumentFile } = (await server.ssrLoadModule(
  '/src/shared/canvas/document-file.ts'
)) as { parseDocumentFile: (bytes: Uint8Array) => ParseDocumentResult }
await server.close()
const temporary = resolve(root, 'discuss/showcase-preview')
const output = resolve(root, 'website/public/examples')
const playerScript = await readFile(
  resolve(root, 'src/renderer/src/generated/player.iife.js'),
  'utf8'
)
await mkdir(temporary, { recursive: true })
const browser = await chromium.launch()
try {
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1000 },
    reducedMotion: 'reduce'
  })
  for (const example of exampleCatalog) {
    const parsed = parseDocumentFile(await readFile(resolve(root, 'examples', example.source)))
    if (!parsed.ok) {
      throw new Error(`${example.id}: ${parsed.error}`)
    }
    const html = resolve(temporary, `${example.id}.html`)
    await writeFile(html, buildStandaloneHtml({ document: parsed.document, playerScript }))
    await page.goto(pathToFileURL(html).href)
    await expect(page.getByTestId('presentation-counter')).toBeVisible()
    if (['flowchart', 'erd', 'architecture', 'mindmap', 'slides'].includes(example.id)) {
      await page.getByRole('button', { name: 'Overview (O)' }).click()
    }
    // The first authored frame is a useful entry into large canvases with nested details.
    await page.evaluate(async () => {
      await document.fonts.ready
      await Promise.all(Array.from(document.images).map((image) => image.decode().catch(() => {})))
    })
    await page.screenshot({
      path: resolve(output, `${example.id}-showcase.png`),
      animations: 'disabled'
    })
    console.log(example.id)
  }
} finally {
  await browser.close()
}
