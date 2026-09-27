import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, expect } from '@playwright/test'
import { exampleExportHtml } from '../example-exports.ts'

// libwebp's command-line tools are only needed to regenerate these committed assets.
execFileSync('img2webp', ['-version'])
execFileSync('cwebp', ['-version'])
const root = resolve(import.meta.dirname, '../..')
const temporary = resolve(root, 'discuss/inside-preview')
const output = resolve(root, 'website/public/examples')
const playbackRate = 1.5
await mkdir(temporary, { recursive: true })
const html = resolve(temporary, 'inside.html')
await writeFile(html, await exampleExportHtml('inside'))
const browser = await chromium.launch()
try {
  const page = await browser.newPage({
    viewport: { width: 960, height: 540 },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference'
  })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto(pathToFileURL(html).href)
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all([...document.images].map((image) => image.decode()))
  })
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  // Keep the original canvas and camera; omit only presentation chrome from the artwork.
  await page.addStyleTag({ content: '[data-presentation-ui] { visibility: hidden !important; }' })
  for (let frame = 1; frame < 8; frame++) {
    await page.keyboard.press('ArrowRight')
  }
  await page.clock.runFor(1600)
  await expect(page.getByTestId('presentation-counter')).toContainText('8 / 13')

  const encoder = ['-loop', '0', '-lossy', '-q', '76', '-m', '4']
  let index = 0
  const capture = async (duration: number) => {
    const file = resolve(temporary, `${String(index++).padStart(4, '0')}.png`)
    await page.screenshot({ path: file })
    encoder.push('-d', String(Math.round(duration / playbackRate)), file)
    return file
  }
  const poster = await capture(1100)
  execFileSync('cwebp', [
    '-quiet',
    '-q',
    '90',
    poster,
    '-o',
    resolve(output, 'inside-preview.webp')
  ])
  for (let frame = 9; frame <= 13; frame++) {
    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('presentation-counter')).toContainText(`${frame} / 13`)
    // Drive the player's own RAF interpolation at approximately 15 fps, independent of capture speed.
    for (let sample = 0; sample < 21; sample++) {
      await page.clock.runFor(67)
      await capture(sample === 20 ? 1100 : 67)
    }
    console.log(`Captured Inside frame ${frame} / 13`)
  }
  // A final hold separates the end of the tour from its next loop.
  encoder[encoder.length - 2] = String(Math.round(2200 / playbackRate))
  execFileSync('img2webp', [...encoder, '-o', resolve(output, 'inside-8-13.webp')], {
    stdio: 'inherit'
  })
} finally {
  await browser.close()
}
