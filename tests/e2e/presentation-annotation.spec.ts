import { expect, test, type Page } from '@playwright/test'
import { dragOnCanvas } from './canvas-gestures'

async function openDeck(page: Page) {
  const frames = [0, 1].map((index) => ({
    id: `f${index + 1}`,
    type: 'frame',
    name: `Shot ${index + 1}`,
    order: index + 1,
    x: index * 2000,
    y: 0,
    width: 1200,
    height: 800
  }))
  await page.goto('/')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Open/ }).click()
  await (
    await chooser
  ).setFiles({
    name: 'annotated.canvaslide',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        name: 'Annotated deck',
        elements: Object.fromEntries(frames.map((frame) => [frame.id, frame])),
        order: frames.map((frame) => frame.id),
        settings: { transitionMs: 120 },
        assets: {},
        resources: {},
        camera: { x: 0, y: 0, zoom: 1 }
      })
    )
  })
  await expect(page.getByTestId('frame-row')).toHaveCount(2)
}

/** A frame this small fits at the camera's maximum zoom, the way the freefall deck's shots do. */
async function openDeepZoomDeck(page: Page) {
  await page.goto('/')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Open/ }).click()
  await (
    await chooser
  ).setFiles({
    name: 'deep.canvaslide',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        name: 'Deep zoom',
        elements: {
          f1: { id: 'f1', type: 'frame', name: 'Tiny', order: 1, x: 0, y: 0, width: 12, height: 8 }
        },
        order: ['f1'],
        settings: { transitionMs: 60 },
        assets: {},
        resources: {},
        camera: { x: 0, y: 0, zoom: 1 }
      })
    )
  })
  await expect(page.getByTestId('frame-row')).toHaveCount(1)
}

/** The document and its history, which a slide show must never touch. */
async function documentState(page: Page) {
  return page.evaluate(async () => {
    const storeUrl = (name: string) =>
      performance
        .getEntriesByType('resource')
        .map((resource) => resource.name)
        .filter((url) => url.includes(`/src/store/${name}.ts`))
        .at(-1)!
    const { useDocumentStore } = await import(storeUrl('document-store'))
    const { annotationSession } = await import(storeUrl('presentation-annotation-store'))
    const doc = useDocumentStore.getState()
    return {
      document: doc.document,
      elements: doc.document.elements,
      past: doc.past.length,
      future: doc.future.length,
      dirty: doc.dirty,
      pointing: annotationSession.getState().pointing
    }
  })
}

const strokes = (page: Page) => page.getByTestId('presentation-ink').locator('path')

async function startShow(page: Page) {
  await page.getByRole('button', { name: 'Slide Show', exact: true }).click()
  await expect(page.getByTestId('presentation-controls')).toBeVisible()
}

test('ink drawn during a show paints, clears and never reaches the document @core-interaction', async ({
  page
}) => {
  await openDeck(page)
  const before = await documentState(page)
  expect(before.past).toBe(0)
  await startShow(page)
  await expect(strokes(page)).toHaveCount(0)

  // The pointer comes out from the control bar; the key does the same thing.
  await page.getByTestId('pointer-toggle').click()
  await expect(page.getByTestId('pointer-toggle')).toHaveAttribute('aria-pressed', 'true')
  await dragOnCanvas(page, [240, 220], [520, 360])
  await expect(strokes(page)).toHaveCount(1)
  expect(await strokes(page).first().getAttribute('d')).toMatch(/^M[\d.-]/)

  const drawn = await documentState(page)
  expect(drawn.document).toEqual(before.document)
  expect(drawn.elements).toEqual(before.elements)
  expect(drawn.past).toBe(0)
  expect(drawn.future).toBe(0)
  expect(drawn.dirty).toBe(before.dirty)

  // A second stroke, then the eraser key wipes both.
  await dragOnCanvas(page, [260, 420], [540, 300])
  await expect(strokes(page)).toHaveCount(2)
  await page.keyboard.press('e')
  await expect(strokes(page)).toHaveCount(0)

  // The ink is painted in the design token's colour, not left unstyled.
  await dragOnCanvas(page, [300, 240], [600, 380])
  await expect(strokes(page)).toHaveCount(1)
  expect(
    await strokes(page)
      .first()
      .evaluate((node) => getComputedStyle(node).stroke)
  ).toBe('rgb(255, 59, 48)')

  // A look at the overview and back returns to the same slide, so the ink must survive it.
  await page.keyboard.press('o')
  await expect(page.getByTestId('overview-frame').first()).toBeVisible()
  await expect(strokes(page)).toHaveCount(1)
  await page.keyboard.press('o')
  await expect(page.getByTestId('overview-frame')).toHaveCount(0)
  await expect(strokes(page)).toHaveCount(1)

  // Navigation still works with the pointer out, and leaving the slide takes its ink with it.
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('presentation-counter')).toContainText('2 / 2')
  await expect(strokes(page)).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('presentation-controls')).toHaveCount(0)
  await expect(page.getByTestId('presentation-ink')).toHaveCount(0)
  const after = await documentState(page)
  expect(after.document).toEqual(before.document)
  expect(after.elements).toEqual(before.elements)
  expect(after.past).toBe(0)
  expect(after.future).toBe(0)
  expect(after.dirty).toBe(before.dirty)
  // Nothing the presenter armed survives the show.
  expect(after.pointing).toBe(false)
})

test('a stroke stays put until something wipes it', async ({ page }) => {
  await openDeck(page)
  await startShow(page)
  await page.keyboard.press('p')
  await dragOnCanvas(page, [240, 220], [520, 360])
  await expect(strokes(page)).toHaveCount(1)
  const drawn = await strokes(page).first().getAttribute('d')
  // Nothing about the ink is timed: the stroke is still there, unchanged and unfaded, seconds on.
  await page.waitForTimeout(4000)
  await expect(strokes(page)).toHaveCount(1)
  expect(await strokes(page).first().getAttribute('d')).toBe(drawn)
  expect(await strokes(page).first().getAttribute('stroke-opacity')).toBeNull()
})

test('one pointer both points and draws, and the laser sits exactly on the cursor', async ({
  page
}) => {
  await openDeck(page)
  await startShow(page)
  await expect(page.getByTestId('laser-pointer')).toHaveCount(0)
  await expect(strokes(page)).toHaveCount(0)

  await page.keyboard.press('p')
  await expect(page.getByTestId('pointer-toggle')).toHaveAttribute('aria-pressed', 'true')
  const dot = page.getByTestId('laser-pointer')
  await expect(dot).toHaveCount(1)
  const box = (await page.getByTestId('canvas-viewport').boundingBox())!
  await page.mouse.move(box.x + 300, box.y + 240)
  const at = () => dot.evaluate((element) => (element as HTMLElement).style.transform)
  // Why: no transition, so the dot is on the cursor on the very next frame, not eased toward it.
  // Engines serialise the z term as `0` or `0px`; only the x and y matter here.
  await expect.poll(at).toMatch(/^translate3d\(300px, 240px, 0(px)?\)$/)
  await page.mouse.move(box.x + 420, box.y + 180)
  await expect.poll(at).toMatch(/^translate3d\(420px, 180px, 0(px)?\)$/)
  expect(await dot.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('0s')

  // The same mode draws: no second tool to reach for, and the laser stays out afterwards.
  await dragOnCanvas(page, [300, 260], [600, 400])
  await expect(strokes(page)).toHaveCount(1)
  await expect(dot).toHaveCount(1)
  await expect(page.getByTestId('pointer-toggle')).toHaveAttribute('aria-pressed', 'true')

  // Erasing keeps the pointer out; putting the pointer away leaves the ink layer mounted.
  await page.getByTestId('ink-clear').click()
  await expect(strokes(page)).toHaveCount(0)
  await expect(page.getByTestId('pointer-toggle')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('p')
  await expect(page.getByTestId('pointer-toggle')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('laser-pointer')).toHaveCount(0)
  await expect(page.getByTestId('presentation-ink')).toHaveCount(1)
})

test('a click leaves no mark, and a stroke keeps its screen width at maximum zoom @core-interaction', async ({
  page
}) => {
  await openDeepZoomDeck(page)
  await startShow(page)
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const url = performance
          .getEntriesByType('resource')
          .map((resource) => resource.name)
          .filter((name) => name.includes('/src/store/camera-store.ts'))
          .at(-1)!
        const { useCameraStore } = await import(url)
        return useCameraStore.getState().camera.zoom
      })
    )
    .toBe(64)

  await page.keyboard.press('p')
  const box = (await page.getByTestId('canvas-viewport').boundingBox())!
  await page.mouse.move(box.x + 500, box.y + 400)
  await page.mouse.down()
  await page.mouse.up()
  // Why: a zero-length subpath is a round cap WebKit paints in world units — 256px at this camera.
  await expect(strokes(page)).toHaveCount(0)

  await dragOnCanvas(page, [700, 400], [760, 430])
  await expect(strokes(page)).toHaveCount(1)
  const drawn = (await strokes(page).first().boundingBox())!
  // The 4px nib does not scale with the camera, so the box is the drag plus a nib either side.
  expect(drawn.width).toBeLessThan(80)
  expect(drawn.height).toBeLessThan(50)
})

test('a release the page never sees does not latch the stroke to the cursor', async ({ page }) => {
  await openDeck(page)
  await startShow(page)
  await page.keyboard.press('p')
  const box = (await page.getByTestId('canvas-viewport').boundingBox())!
  await page.mouse.move(box.x + 300, box.y + 300)
  await page.mouse.down()
  await page.mouse.move(box.x + 400, box.y + 300, { steps: 4 })
  await expect(strokes(page)).toHaveCount(1)
  const drawn = await strokes(page).first().getAttribute('d')

  // A button released outside the window shows up as a move with no button held, never a pointerup.
  await page.evaluate(() =>
    window.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 1,
        isPrimary: true,
        buttons: 0,
        clientX: 900,
        clientY: 700,
        bubbles: true
      })
    )
  )
  await page.mouse.move(box.x + 700, box.y + 500, { steps: 4 })
  expect(await strokes(page).first().getAttribute('d')).toBe(drawn)
  await expect(strokes(page)).toHaveCount(1)
  await page.mouse.up()
})

test('a drag whose release no move reported still draws, and a cancel does not', async ({
  page
}) => {
  await openDeck(page)
  await startShow(page)
  await page.keyboard.press('p')
  const box = (await page.getByTestId('canvas-viewport').boundingBox())!
  const at = (type: string, x: number, y: number) =>
    page.evaluate(
      ({ type, x, y }) =>
        window.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 1,
            isPrimary: true,
            buttons: type === 'pointerup' ? 0 : 1,
            clientX: x,
            clientY: y,
            bubbles: true
          })
        ),
      { type, x, y }
    )

  // Press and release 90px apart with no pointermove in between: the release is the whole stroke.
  await page.mouse.move(box.x + 300, box.y + 300)
  await page.mouse.down()
  await at('pointerup', box.x + 390, box.y + 300)
  await expect(strokes(page)).toHaveCount(1)
  expect(await strokes(page).first().getAttribute('d')).toMatch(
    /^M[\d.-]+,[\d.-]+L[\d.-]+,[\d.-]+$/
  )
  await page.mouse.up()
  await page.keyboard.press('e')
  await expect(strokes(page)).toHaveCount(0)

  // A cancelled pointer has no release position, so it must not reach for one.
  await page.mouse.move(box.x + 300, box.y + 400)
  await page.mouse.down()
  await at('pointercancel', box.x + 390, box.y + 400)
  await expect(strokes(page)).toHaveCount(0)
  await page.mouse.up()
})
