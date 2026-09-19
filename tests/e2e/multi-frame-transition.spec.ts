import { expect, test, type Page } from '@playwright/test'
import { dragOnCanvas, primaryModifier } from './canvas-gestures'

// Keep native macOS Control-click from becoming a context menu in the Windows device preset.
if (process.platform === 'darwin') {
  test.use({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })
}

async function openDeck(page: Page) {
  const transitions = [
    { roll: 15, spotlight: 0.2 },
    { easing: 'linear' },
    { roll: -30, ms: 700 },
    {}
  ]
  const frames = transitions.map((transition, index) => ({
    id: `f${index + 1}`,
    type: 'frame',
    name: `Shot ${index + 1}`,
    order: index + 1,
    x: index * 2000,
    y: 0,
    width: 1200,
    height: 800,
    transition
  }))
  await page.goto('/')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Open/ }).click()
  await (
    await chooser
  ).setFiles({
    name: 'batch.canvaslide',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 2,
        name: 'Batch camera',
        elements: Object.fromEntries(frames.map((frame) => [frame.id, frame])),
        order: frames.map((frame) => frame.id),
        settings: { transitionMs: 200 },
        assets: {},
        camera: { x: 0, y: 0, zoom: 1 }
      })
    )
  })
  await expect(page.getByTestId('frame-row')).toHaveCount(4)
}

const row = (page: Page, index: number) =>
  page.getByTestId('frame-row').nth(index).getByRole('button').first()
const selectedRows = (page: Page) => page.locator('[data-testid="frame-row"][data-current="true"]')

async function state(page: Page) {
  return page.evaluate(async () => {
    const storeUrl = (name: string) =>
      performance
        .getEntriesByType('resource')
        .map((resource) => resource.name)
        .filter((url) => url.includes(`/src/store/${name}.ts`))
        .at(-1)!
    const { useDocumentStore } = await import(storeUrl('document-store'))
    const { useCameraStore } = await import(storeUrl('camera-store'))
    const { usePresentationStore } = await import(storeUrl('presentation-store'))
    const doc = useDocumentStore.getState()
    const camera = useCameraStore.getState()
    const preview = usePresentationStore.getState()
    return {
      elements: doc.document.elements,
      selectedIds: doc.selectedIds,
      past: doc.past.length,
      camera: camera.camera,
      animating: camera.animationActive,
      previewId: preview.previewFrameId,
      previewIds: preview.previewFrameIds,
      roll: preview.roll,
      spotlight: preview.spotlight
    }
  })
}

async function rest(page: Page) {
  await expect.poll(async () => (await state(page)).animating).toBe(false)
}

for (const platform of ['Macintosh; Intel Mac OS X 10_15_7', 'Windows NT 10.0; Win64; x64']) {
  test(`frame list toggle and range selection (${platform}) @webkit`, async ({ page }) => {
    await page.addInitScript((platform) => {
      Object.defineProperty(navigator, 'userAgent', { get: () => `Mozilla/5.0 (${platform})` })
    }, platform)
    await openDeck(page)
    const primary = await primaryModifier(page)
    await row(page, 0).click()
    await rest(page)
    const before = (await state(page)).camera
    await (process.platform === 'darwin' && primary === 'Control'
      ? row(page, 2).dispatchEvent('click', { ctrlKey: true })
      : row(page, 2).click({ modifiers: [primary] }))
    await expect(selectedRows(page)).toHaveCount(2)
    expect((await state(page)).camera).toEqual(before)
    await expect(row(page, 0)).toHaveAttribute('aria-pressed', 'true')
    await (process.platform === 'darwin' && primary === 'Control'
      ? row(page, 0).dispatchEvent('click', { ctrlKey: true })
      : row(page, 0).click({ modifiers: [primary] }))
    await expect(selectedRows(page)).toHaveCount(1)
    await row(page, 0).click()
    await row(page, 3).click({ modifiers: ['Shift'] })
    await expect(selectedRows(page)).toHaveCount(4)
    await row(page, 1).click({ modifiers: ['Shift'] })
    await expect(selectedRows(page)).toHaveCount(2)
    await row(page, 2).click()
    await expect(selectedRows(page)).toHaveCount(1)
    await expect(row(page, 2)).toHaveAttribute('aria-pressed', 'true')
    await rest(page)
    expect((await state(page)).camera).not.toEqual(before)
  })
}

test('batch fields preserve other overrides and undo/reset the whole selection @webkit', async ({
  page
}) => {
  await openDeck(page)
  const primary = await primaryModifier(page)
  await row(page, 0).click()
  await row(page, 2).click({ modifiers: [primary] })
  const original = await state(page)
  await expect(page.getByTestId('alignment-toolbar')).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: 'Roll', exact: true })).toHaveValue('mixed')
  await expect(page.getByRole('combobox', { name: 'Duration' })).toHaveValue('mixed')
  await page.getByRole('combobox', { name: 'Duration' }).selectOption('2000')
  let changed = await state(page)
  expect(changed.past).toBe(original.past + 1)
  expect(changed.elements.f1.transition).toEqual({ ms: 2000, roll: 15, spotlight: 0.2 })
  expect(changed.elements.f3.transition).toEqual({ ms: 2000, roll: -30 })
  expect(changed.elements.f2).toEqual(original.elements.f2)
  await page.getByRole('combobox', { name: 'Duration' }).blur()
  await page.keyboard.press(`${primary}+z`)
  expect((await state(page)).elements).toEqual(original.elements)
  await page.keyboard.press(`${primary}+Shift+z`)
  expect((await state(page)).elements).toEqual(changed.elements)
  await page.getByRole('combobox', { name: 'Easing' }).selectOption('overshoot')
  await page.getByRole('combobox', { name: 'Arc' }).selectOption('2.2')
  await page.getByRole('combobox', { name: 'Roll', exact: true }).selectOption('-15')
  await page.getByRole('combobox', { name: 'Spotlight' }).selectOption('1')
  changed = await state(page)
  for (const id of ['f1', 'f3']) {
    expect(changed.elements[id].transition).toEqual({
      ms: 2000,
      easing: 'overshoot',
      arc: 2.2,
      roll: -15,
      spotlight: 1
    })
  }
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  const reset = await state(page)
  expect(reset.past).toBe(changed.past + 1)
  expect(reset.elements.f1.transition).toEqual({ ms: 1000 })
  expect(reset.elements.f3.transition).toEqual({ ms: 1000 })
  await expect(page.getByRole('combobox', { name: 'Duration' })).toHaveValue('1000')
  await expect(page.locator('[data-testid="motion-control"][data-non-default="true"]')).toHaveCount(
    0
  )
  await expect(selectedRows(page).getByTestId('frame-motion-marks')).toHaveCount(0)
  expect(reset.elements.f2).toEqual(original.elements.f2)
  await page.keyboard.press(`${primary}+z`)
  expect((await state(page)).elements).toEqual(changed.elements)
  await page.keyboard.press(`${primary}+Shift+z`)
  expect((await state(page)).elements).toEqual(reset.elements)
})

test('advanced batch slider keeps one undo step and leaves other fields intact @webkit', async ({
  page
}) => {
  await openDeck(page)
  const primary = await primaryModifier(page)
  await row(page, 0).click()
  await row(page, 2).click({ modifiers: [primary] })
  await page.getByRole('button', { name: 'Advanced' }).click()
  const slider = page.getByRole('slider', { name: 'Roll', exact: true })
  await expect(slider).toHaveAttribute('aria-valuetext', 'Mixed')
  const original = await state(page)
  const box = (await slider.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 12 })
  await page.mouse.up()
  const changed = await state(page)
  expect(changed.past).toBe(original.past + 1)
  expect(changed.elements.f1.transition.roll).toBe(changed.elements.f3.transition.roll)
  expect(changed.elements.f1.transition.spotlight).toBe(0.2)
  expect(changed.elements.f3.transition.ms).toBe(700)
  await slider.blur()
  await page.keyboard.press(`${primary}+z`)
  expect((await state(page)).elements).toEqual(original.elements)
})

test('preview steps only selected frames, keeps editing usable, and restores the camera @webkit', async ({
  page
}) => {
  await openDeck(page)
  const primary = await primaryModifier(page)
  await row(page, 0).click()
  await row(page, 2).click({ modifiers: [primary] })
  await row(page, 3).click({ modifiers: [primary] })
  await rest(page)
  const original = await state(page)
  await page.getByRole('button', { name: 'Preview selected frames' }).click()
  const controls = page.getByTestId('preview-controls')
  await expect(controls).toContainText('Shot 1')
  await expect(controls).toContainText('1 / 3')
  await expect(page.getByRole('button', { name: 'Previous selected frame' })).toBeDisabled()
  await rest(page)
  await page.getByRole('button', { name: 'Next selected frame' }).click()
  await expect(controls).toContainText('Shot 3')
  await rest(page)
  expect((await state(page)).roll).toBe(-30)
  await page.keyboard.press('Space')
  await expect(controls).toContainText('Shot 4')
  await expect(page.getByRole('button', { name: 'Next selected frame' })).toBeDisabled()
  await page.keyboard.press('ArrowRight')
  await expect(controls).toContainText('Shot 4')
  await page.keyboard.press('ArrowLeft')
  await expect(controls).toContainText('Shot 3')
  await page.getByRole('button', { name: 'Play it again' }).click()
  await rest(page)
  expect((await state(page)).previewIds).toEqual(['f1', 'f3', 'f4'])
  await page.getByRole('button', { name: 'Previous selected frame' }).click()
  await expect(controls).toContainText('Shot 1')
  // Editing inputs consume their own arrows even when preview controls are present.
  await page.getByRole('button', { name: 'Advanced' }).click()
  const slider = page.getByRole('slider', { name: 'Roll', exact: true })
  await slider.focus()
  await page.keyboard.press('ArrowRight')
  expect((await state(page)).previewId).toBe('f1')
  await page.keyboard.press('Escape')
  await expect(controls).toHaveCount(0)
  await rest(page)
  const after = await state(page)
  expect(after.camera).toEqual(original.camera)
  expect(after.selectedIds).toEqual(original.selectedIds)
  expect(after.roll).toBe(0)
  expect(after.spotlight).toBe(0)
})

test('canvas marquee exposes batch camera fields only for a frame-only selection @webkit', async ({
  page
}) => {
  await page.goto('/')
  await page.keyboard.press('f')
  await dragOnCanvas(page, [200, 200], [400, 400])
  await page.keyboard.press('f')
  await dragOnCanvas(page, [500, 200], [700, 400])
  await page.keyboard.press('Escape')
  await dragOnCanvas(page, [150, 150], [750, 450])
  await expect(selectedRows(page)).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Preview selected frames' })).toBeVisible()
  await expect(page.getByTestId('alignment-toolbar')).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Roll', exact: true }).selectOption('15')
  await page.getByRole('combobox', { name: 'Roll', exact: true }).blur()
  await page.keyboard.press('r')
  await dragOnCanvas(page, [800, 200], [900, 300])
  await page.keyboard.press('Escape')
  await dragOnCanvas(page, [150, 150], [950, 450])
  await expect(selectedRows(page)).toHaveCount(2)
  await expect(page.getByRole('combobox', { name: 'Roll', exact: true })).toHaveCount(0)
  await expect(page.getByTestId('alignment-toolbar')).toBeVisible()
})
