import { expect, test, type Page } from '@playwright/test'
import {
  createEmptyDocument,
  defaultShapeStyle,
  defaultTextStyle,
  type CanvasDocument,
  type CanvasElement
} from '../../src/shared/canvas/element-types'
import { dragOnCanvas, primaryModifier } from './canvas-gestures'

function scene(): CanvasDocument {
  const frame = (
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    order: number
  ): CanvasElement => ({
    id,
    type: 'frame',
    name: id,
    x,
    y,
    width,
    height,
    order
  })
  const shape = (id: string, x: number, y: number): CanvasElement => ({
    id,
    type: 'shape',
    shape: 'rectangle',
    x,
    y,
    width: 60,
    height: 50,
    style: defaultShapeStyle,
    text: id,
    textStyle: defaultTextStyle
  })
  const elements: CanvasElement[] = [
    frame('Outer', 180, 180, 430, 310, 0),
    frame('Inner', 250, 250, 260, 180, 1),
    { ...shape('A', 280, 300), groupId: 'original-group' },
    { ...shape('B', 430, 300), groupId: 'original-group' },
    {
      id: 'link',
      type: 'connector',
      x: 340,
      y: 325,
      width: 90,
      height: 1,
      start: { x: 340, y: 325, elementId: 'A', side: 'right', pinned: true },
      end: { x: 430, y: 325, elementId: 'B', side: 'left', pinned: true },
      route: 'straight',
      startHead: 'none',
      endHead: 'arrow',
      style: { stroke: '#52525b', strokeWidth: 2, dashed: false },
      label: '',
      textStyle: defaultTextStyle
    },
    frame('Second', 680, 210, 200, 230, 2),
    shape('C', 720, 300)
  ]
  return {
    ...createEmptyDocument(),
    elements: Object.fromEntries(elements.map((element) => [element.id, element])),
    order: elements.map((element) => element.id)
  }
}

async function state(
  page: Page
): Promise<{ document: CanvasDocument; selectedIds: string[]; past: number }> {
  return page.evaluate(async () => {
    const url = '/src/store/document-store.ts'
    const { useDocumentStore } = await import(url)
    const s = useDocumentStore.getState()
    return { document: s.document, selectedIds: s.selectedIds, past: s.past.length }
  })
}

async function loadScene(page: Page) {
  await page.goto('/')
  await page.getByTestId('canvas-viewport').waitFor()
  await page.evaluate(async (doc) => {
    const docUrl = '/src/store/document-store.ts'
    const cameraUrl = '/src/store/camera-store.ts'
    const { useDocumentStore } = await import(docUrl)
    const { useCameraStore } = await import(cameraUrl)
    useDocumentStore.getState().loadDocument(doc, null)
    useCameraStore.getState().setCamera({ x: 0, y: 0, zoom: 1 })
  }, scene())
  await expect(page.locator('[data-element-id="A"]')).toBeVisible()
}

async function dragWithoutSnap(page: Page, from: [number, number], delta: [number, number]) {
  const box = (await page.getByTestId('canvas-viewport').boundingBox())!
  const mod = await primaryModifier(page)
  await page.mouse.move(box.x + from[0], box.y + from[1])
  await page.mouse.down()
  await page.keyboard.down(mod)
  await page.mouse.move(box.x + from[0] + delta[0], box.y + from[1] + delta[1], { steps: 8 })
  await page.mouse.up()
  await page.keyboard.up(mod)
}

test('marquee copy and immediate paste move only copied frames, groups and connectors @webkit', async ({
  page,
  browserName
}) => {
  await loadScene(page)
  const before = await state(page)
  await dragOnCanvas(page, [150, 135], [910, 515])
  expect(new Set((await state(page)).selectedIds)).toEqual(new Set(before.document.order))
  const mod = await primaryModifier(page)
  await page.keyboard.press(`${mod}+c`)
  await page.keyboard.press(`${mod}+v`)
  await expect.poll(async () => (await state(page)).document.order.length).toBe(14)
  const pasted = await state(page)
  expect(pasted.selectedIds).toHaveLength(7)
  expect(pasted.selectedIds.every((id) => !before.document.elements[id])).toBe(true)
  const [outerId, , aId, bId, linkId] = pasted.selectedIds
  const copiedA = pasted.document.elements[aId!]!
  expect(copiedA.groupId).toBeTruthy()
  expect(copiedA.groupId).not.toBe('original-group')
  expect(pasted.document.elements[bId!]!.groupId).toBe(copiedA.groupId)
  expect(pasted.document.elements[linkId!]).toMatchObject({
    start: { elementId: aId },
    end: { elementId: bId }
  })
  const copiedOuter = pasted.document.elements[outerId!]!
  expect(copiedOuter).toMatchObject({ x: 204, y: 204 })
  if (process.env.CANVASLIDE_DRAG_PROOF) {
    await page.screenshot({
      path: `discuss/${process.env.CANVASLIDE_DRAG_PROOF}-${browserName}-pasted.png`
    })
  }
  await dragWithoutSnap(page, [244, 194], [100, 150])
  if (process.env.CANVASLIDE_DRAG_PROOF) {
    await page.screenshot({
      path: `discuss/${process.env.CANVASLIDE_DRAG_PROOF}-${browserName}-dragged.png`
    })
  }
  const moved = await state(page)
  for (const id of before.document.order) {
    expect(moved.document.elements[id], `original ${id}`).toEqual(before.document.elements[id])
  }
  expect(new Set(moved.selectedIds)).toEqual(new Set(pasted.selectedIds))
  for (const id of pasted.selectedIds) {
    expect(moved.document.elements[id]).toMatchObject({
      x: pasted.document.elements[id]!.x + 100,
      y: pasted.document.elements[id]!.y + 150
    })
  }
  expect(moved.past).toBe(pasted.past + 1)
  await page.keyboard.press(`${mod}+z`)
  expect((await state(page)).document).toEqual(pasted.document)
  await page.keyboard.press(`${mod}+Shift+z`)
  expect((await state(page)).document).toEqual(moved.document)
})

test('reselecting a frame after repeated paste keeps earlier copies and original frames still @webkit', async ({
  page
}) => {
  await loadScene(page)
  await dragOnCanvas(page, [150, 135], [910, 515])
  const mod = await primaryModifier(page)
  await page.keyboard.press(`${mod}+c`)
  await page.keyboard.press(`${mod}+v`)
  await expect.poll(async () => (await state(page)).document.order.length).toBe(14)
  const first = await state(page)
  await page.keyboard.press(`${mod}+v`)
  await expect.poll(async () => (await state(page)).document.order.length).toBe(21)
  const second = await state(page)
  const [outerId, , aId, bId, linkId] = second.selectedIds
  expect(second.document.elements[outerId!]).toMatchObject({ x: 228, y: 228 })
  await page.keyboard.press('Escape')
  await page.getByTestId('canvas-viewport').click({ position: { x: 268, y: 218 } })
  expect((await state(page)).selectedIds).toEqual([outerId])
  await dragWithoutSnap(page, [268, 218], [60, 80])
  const moved = await state(page)
  const moving = new Set([outerId, aId, bId, linkId])
  expect(new Set(moved.selectedIds)).toEqual(moving)
  for (const id of second.document.order) {
    if (moving.has(id)) {
      expect(moved.document.elements[id]).toMatchObject({
        x: second.document.elements[id]!.x + 60,
        y: second.document.elements[id]!.y + 80
      })
    } else {
      expect(moved.document.elements[id], `unmoved ${id}`).toEqual(second.document.elements[id])
    }
  }
  await page.keyboard.press(`${mod}+z`)
  expect((await state(page)).document).toEqual(second.document)
  await page.keyboard.press(`${mod}+z`)
  expect((await state(page)).document).toEqual(first.document)
  await page.keyboard.press(`${mod}+Shift+z`)
  expect((await state(page)).document).toEqual(second.document)
  await page.keyboard.press(`${mod}+Shift+z`)
  expect((await state(page)).document).toEqual(moved.document)
  await page.keyboard.press(`${mod}+z`)
  await page.keyboard.press('Escape')
  await page.getByTestId('canvas-viewport').click({ position: { x: 220, y: 170 } })
  await dragWithoutSnap(page, [220, 170], [-60, 30])
  const originalMoved = await state(page)
  for (const id of [...first.selectedIds, ...second.selectedIds]) {
    expect(originalMoved.document.elements[id]).toEqual(second.document.elements[id])
  }
  for (const id of ['Outer', 'A', 'B', 'link']) {
    expect(originalMoved.document.elements[id]).toMatchObject({
      x: second.document.elements[id]!.x - 60,
      y: second.document.elements[id]!.y + 30
    })
  }
})
