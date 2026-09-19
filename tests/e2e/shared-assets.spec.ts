import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { unzipSync } from 'fflate'
import { createImageAsset } from '../../src/shared/canvas/document-assets'
import { createEmptyDocument, type CanvasDocument } from '../../src/shared/canvas/element-types'
import { primaryModifier } from './canvas-gestures'
import { readSavedDocument } from './saved-document'

async function openBytes(page: Page, buffer: Buffer) {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Open/ }).click()
  await (
    await chooser
  ).setFiles({ name: 'shared.canvaslide', mimeType: 'application/octet-stream', buffer })
  await expect(page.locator('[data-element-type="image"]')).toHaveCount(2)
  await expect
    .poll(() =>
      page
        .locator('img[data-element-type="image"]')
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0
          )
        )
    )
    .toBe(true)
}

test('shared crops and masks survive save/reopen and offline HTML export @webkit', async ({
  page
}, info) => {
  await page.goto('/')
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const context = canvas.getContext('2d')!
    context.fillStyle = '#ef3456'
    context.fillRect(0, 0, 32, 64)
    context.fillStyle = '#1234ef'
    context.fillRect(32, 0, 32, 64)
    return canvas.toDataURL()
  })
  const doc: CanvasDocument = createEmptyDocument('Shared images')
  doc.settings.background = 'plain'
  doc.settings.transitionMs = 0
  doc.elements.frame = {
    id: 'frame',
    type: 'frame',
    name: 'Crops',
    order: 0,
    x: 0,
    y: 0,
    width: 500,
    height: 260
  }
  doc.order.push('frame')
  for (const [index, transform] of ['translate(0 0)', 'translate(64 0) scale(-1 1)'].entries()) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><clipPath id="crop"><circle cx="32" cy="32" r="28"/></clipPath><mask id="fade"><rect width="64" height="64" fill="white" opacity=".6"/></mask></defs><g clip-path="url(#crop)" mask="url(#fade)"><image width="64" height="64" transform="${transform}" href="${png}"/></g></svg>`
    const asset = createImageAsset(
      `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
      64,
      64
    )
    doc.assets[asset.id] = asset
    const id = `image-${index}`
    doc.elements[id] = {
      id,
      type: 'image',
      x: 20 + index * 240,
      y: 20,
      width: 200,
      height: 200,
      naturalWidth: 64,
      naturalHeight: 64,
      assetId: asset.id
    }
    doc.order.push(id)
  }
  await openBytes(page, Buffer.from(JSON.stringify(doc)))
  await page.mouse.move(0, 0)
  const images = page.locator('img[data-element-type="image"]')
  const before = await images.first().screenshot()
  const downloaded = page.waitForEvent('download')
  await page.keyboard.press(`${await primaryModifier(page)}+s`)
  const download = await downloaded
  const bytes = await readFile((await download.path())!)
  expect(bytes.subarray(0, 4)).toEqual(Buffer.from([80, 75, 3, 4]))
  expect(Object.keys(unzipSync(bytes))).toHaveLength(4)
  expect(readSavedDocument(bytes).assets).toEqual(doc.assets)
  await page.reload()
  await openBytes(page, bytes)
  await page.mouse.move(0, 0)
  expect(await images.first().screenshot()).toEqual(before)

  await page.getByRole('button', { name: 'Share', exact: true }).click()
  await page.getByRole('button', { name: 'Export HTML', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Export presentation' })
  await dialog.getByLabel(/Original/).check()
  await expect(dialog.getByTestId('export-size')).not.toContainText('calculating')
  const exported = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export…' }).click()
  const htmlPath = info.outputPath('shared.html')
  await (await exported).saveAs(htmlPath)
  const player = await page.context().newPage()
  const externalRequests: string[] = []
  player.on('request', (request) => {
    if (/^https?:/.test(request.url())) {
      externalRequests.push(request.url())
    }
  })
  await player.goto(pathToFileURL(htmlPath).href)
  await expect(player.locator('.uc-img')).toHaveCount(2)
  await expect
    .poll(() =>
      player
        .locator('.uc-img')
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0
          )
        )
    )
    .toBe(true)
  expect(
    await player
      .locator('.uc-img')
      .evaluateAll((images) => images.map((image) => image.getAttribute('src')))
  ).toEqual(Object.values(doc.assets).map((asset) => asset.data))
  expect(externalRequests).toEqual([])
})
