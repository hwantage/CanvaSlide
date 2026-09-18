import { expect, test, type Page } from '@playwright/test'
import { insertElements } from '../../src/shared/canvas/document-mutations'
import { createEmptyDocument, type FrameElement } from '../../src/shared/canvas/element-types'
import { dragOnCanvas, primaryModifier } from './canvas-gestures'

async function expectSlides(page: Page, names: number[]) {
  const rows = page.getByTestId('frame-row')
  await expect(rows).toHaveCount(names.length)
  for (const [index, name] of names.entries()) {
    await expect(rows.nth(index).getByRole('button').first()).toHaveText(
      `${index + 1}Slide ${name}`
    )
  }
}

test('marquee copy and paste retain slide order when frame paint order is reversed @webkit', async ({
  page
}) => {
  const frames: FrameElement[] = [3, 2, 1].map((number) => ({
    id: `f${number}`,
    type: 'frame',
    name: `Slide ${number}`,
    order: number,
    x: 120 + (number - 1) * 310,
    y: 180,
    width: 240,
    height: 180
  }))
  await page.goto('/')
  await page.getByTestId('canvas-viewport').waitFor()
  await page.evaluate(
    async (doc) => {
      const docUrl = '/src/store/document-store.ts'
      const cameraUrl = '/src/store/camera-store.ts'
      const { useDocumentStore } = await import(docUrl)
      const { useCameraStore } = await import(cameraUrl)
      useDocumentStore.getState().loadDocument(doc, null)
      useCameraStore.getState().setCamera({ x: 0, y: 0, zoom: 1 })
    },
    insertElements(createEmptyDocument(), frames)
  )
  await expectSlides(page, [1, 2, 3])
  await dragOnCanvas(page, [90, 100], [1000, 390])
  const mod = await primaryModifier(page)
  await page.keyboard.press(`${mod}+c`)
  await page.keyboard.press(`${mod}+v`)
  await expectSlides(page, [1, 2, 3, 1, 2, 3])
  await page.keyboard.press(`${mod}+v`)
  await expectSlides(page, [1, 2, 3, 1, 2, 3, 1, 2, 3])
  await page.keyboard.press(`${mod}+z`)
  await expectSlides(page, [1, 2, 3, 1, 2, 3])
  await page.keyboard.press(`${mod}+Shift+z`)
  await expectSlides(page, [1, 2, 3, 1, 2, 3, 1, 2, 3])
})
