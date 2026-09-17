import { expect, test, type Page } from '@playwright/test'

type FrameTransition = {
  ms?: number
  easing?: string
  arc?: number
  roll?: number
  spotlight?: number
}

const shape = (id: string, x: number) => ({
  id,
  type: 'shape',
  shape: 'rectangle',
  x,
  y: 100,
  width: 400,
  height: 300,
  style: { fill: '#ffffff', stroke: '#cbd5e1', strokeWidth: 2, cornerRadius: 8 },
  text: '',
  textStyle: { color: '#0f172a', fontSize: 16, align: 'left', bold: false }
})

function frame(index: number, name: string, transition?: FrameTransition) {
  return {
    id: `frame-${index}`,
    type: 'frame',
    name,
    order: index,
    x: index * 4000,
    y: 0,
    width: 1600,
    height: 900,
    ...(transition ? { transition } : {})
  }
}

async function openDeck(page: Page, frames: ReturnType<typeof frame>[], extras: object[] = []) {
  const all = [...frames, ...extras] as { id: string }[]
  const document = {
    version: 2,
    name: 'Direction',
    elements: Object.fromEntries(all.map((f) => [f.id, f])),
    order: all.map((f) => f.id),
    settings: { transitionMs: 400, background: 'dots', frameBorder: 'solid' },
    assets: {},
    camera: { x: 0, y: 0, zoom: 1 }
  }
  await page.goto('/')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Open/ }).click()
  await (
    await chooser
  ).setFiles({
    name: 'direction.canvaslide',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(document))
  })
  await expect(page.getByTestId('frame-row')).toHaveCount(frames.length)
}

/** The control for one camera setting; a `data-overridden` one wears the primary border. */
const motionControl = (page: Page, field: string) =>
  page.locator(`[data-testid="motion-control"][data-field="${field}"]`)

/** The tilt the stage is drawn with, in whole degrees; 0 when it is not transformed at all. */
const stageRollOf = (page: Page) =>
  page.getByTestId('presentation-stage').evaluate((node) => {
    const m = /matrix\(([-\d.]+),\s*([-\d.]+)/.exec(getComputedStyle(node).transform)
    return m ? Math.round((Math.atan2(Number(m[2]), Number(m[1])) * 180) / Math.PI) : 0
  })

const cameraState = (page: Page) =>
  page.evaluate(async () => {
    const url = performance
      .getEntriesByType('resource')
      .map((r) => r.name)
      .filter((name) => name.includes('/src/store/camera-store.ts'))
      .at(-1)!
    const { useCameraStore } = await import(url)
    const { camera, animationActive } = useCameraStore.getState()
    return { x: camera.x as number, animationActive: animationActive as boolean }
  })

const cameraX = async (page: Page) => (await cameraState(page)).x

const observeDepartureHold = (page: Page) =>
  page.evaluateHandle(async () => {
    const url = performance
      .getEntriesByType('resource')
      .map((r) => r.name)
      .filter((name) => name.includes('/src/store/camera-store.ts'))
      .at(-1)!
    const { useCameraStore } = await import(url)
    const initialX = useCameraStore.getState().camera.x
    const stage = document.querySelector('[data-testid="presentation-stage"]')!
    // Sample inside the page so click handling and Playwright polling do not count as hold time.
    return {
      result: new Promise<{ departureX: number; roll: number; holdMs: number }>((resolve) => {
        let departure: { x: number; at: number; roll: number } | undefined
        const sample = (now: number) => {
          const x = useCameraStore.getState().camera.x as number
          if (!departure && x !== initialX) {
            const matrix = new DOMMatrixReadOnly(getComputedStyle(stage).transform)
            departure = {
              x,
              at: now,
              roll: Math.round((Math.atan2(matrix.b, matrix.a) * 180) / Math.PI)
            }
          } else if (departure && x !== departure.x) {
            resolve({ departureX: departure.x, roll: departure.roll, holdMs: now - departure.at })
            return
          }
          requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
      })
    }
  })

test('a frame inherits the document defaults until a step overrides one', async ({ page }) => {
  await openDeck(page, [frame(0, 'Plain'), frame(1, 'Directed', { ms: 2500 })])
  const duration = page.getByRole('combobox', { name: 'Duration' })
  const resetAll = page.getByRole('button', { name: 'Reset', exact: true })

  await page.getByTestId('frame-row').first().click()
  // The deck transitions in 400ms, which is the Fast step itself.
  await expect(duration).toHaveValue('400')
  await expect(motionControl(page, 'ms')).toHaveAttribute('data-overridden', 'false')
  await expect(resetAll).toBeDisabled()

  await duration.selectOption({ label: 'Slow' })
  await expect(duration).toHaveValue('2000')
  await expect(motionControl(page, 'ms')).toHaveAttribute('data-overridden', 'true')
  await expect(resetAll).toBeEnabled()

  // Landing back on the step the document already uses is not an override; the dot goes out.
  await duration.selectOption({ label: 'Fast' })
  await expect(motionControl(page, 'ms')).toHaveAttribute('data-overridden', 'false')
  await expect(resetAll).toBeDisabled()
  await duration.selectOption({ label: 'Slow' })

  // 2500ms sits between the steps, so it is kept and spelled out instead of snapping to one.
  await page.getByTestId('frame-row').nth(1).click()
  await expect(duration).toHaveValue('custom')
  await expect(duration.locator('option[value="custom"]')).toHaveText('2.5s')

  // Resetting hands the frame back to the document, without touching the other one.
  await resetAll.click()
  await expect(duration).toHaveValue('400')
  await expect(resetAll).toBeDisabled()
  await page.getByTestId('frame-row').first().click()
  await expect(duration).toHaveValue('2000')
})

test('per-frame easing and arc are written as overrides', async ({ page }) => {
  await openDeck(page, [frame(0, 'One'), frame(1, 'Two')])
  await page.getByTestId('frame-row').nth(1).click()

  await page.getByRole('combobox', { name: 'Easing' }).selectOption('overshoot')
  await page.getByRole('combobox', { name: 'Arc' }).selectOption({ label: 'Wide' })

  await expect(page.getByRole('combobox', { name: 'Easing' })).toHaveValue('overshoot')
  await expect(page.getByRole('combobox', { name: 'Arc' })).toHaveValue('2.2')
  // Choosing the document's own curve again drops the override rather than pinning it.
  await page.getByRole('combobox', { name: 'Easing' }).selectOption('smooth')
  await expect(motionControl(page, 'easing')).toHaveAttribute('data-overridden', 'false')
  await page.getByRole('combobox', { name: 'Easing' }).selectOption('overshoot')
  // The untouched frame still reads the document default.
  await page.getByTestId('frame-row').first().click()
  await expect(page.getByRole('combobox', { name: 'Easing' })).toHaveValue('smooth')
  await expect(page.getByRole('combobox', { name: 'Arc' })).toHaveValue(String(Math.SQRT2))
})

test('Advanced swaps the steps for the raw sliders', async ({ page }) => {
  await openDeck(page, [frame(0, 'One'), frame(1, 'Two')])
  await page.getByTestId('frame-row').nth(1).click()

  const arc = page.getByRole('slider', { name: 'Arc' })
  const select = page.getByRole('combobox', { name: 'Arc' })
  await expect(arc).toHaveCount(0)

  const advanced = page.getByRole('button', { name: 'Advanced' })
  await advanced.click()
  // One control per row, not both: the slider takes the select's place.
  await expect(select).toHaveCount(0)
  await arc.fill('2.4')

  // Closing it again keeps the value, as its own entry rather than the nearest step.
  await advanced.click()
  await expect(arc).toHaveCount(0)
  await expect(select).toHaveValue('custom')
  await expect(select.locator('option[value="custom"]')).toHaveText('2.40')
})

test('a tilt states its direction, so no toggle has to be pressed to find out', async ({
  page
}) => {
  await openDeck(page, [frame(0, 'One'), frame(1, 'Two')])
  await page.getByTestId('frame-row').nth(1).click()
  const roll = page.getByRole('combobox', { name: 'Roll' })

  await expect(roll).toHaveValue('0')
  await roll.selectOption({ label: 'Right Mid' })
  await expect(roll).toHaveValue('15')
  await roll.selectOption({ label: 'Left Mid' })
  await expect(roll).toHaveValue('-15')
  await page.getByRole('button', { name: 'Advanced' }).click()
  await expect(page.getByRole('slider', { name: 'Roll' })).toHaveValue('-15')
  await page.getByRole('button', { name: 'Advanced' }).click()

  // None is the same thing as no tilt at all, so it drops the override.
  await roll.selectOption({ label: 'None' })
  await expect(motionControl(page, 'roll')).toHaveAttribute('data-overridden', 'false')
})

test('Reset hands the whole section back in one go', async ({ page }) => {
  await openDeck(page, [frame(0, 'One'), frame(1, 'Two')])
  await page.getByTestId('frame-row').nth(1).click()
  await page.getByRole('combobox', { name: 'Roll' }).selectOption({ label: 'Left Mid' })
  await page.getByRole('combobox', { name: 'Spotlight' }).selectOption({ label: 'High' })
  const row = page.getByTestId('frame-row').nth(1)
  await expect(row.getByTestId('frame-motion-marks')).toHaveCount(1)

  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(motionControl(page, 'roll')).toHaveAttribute('data-overridden', 'false')
  await expect(motionControl(page, 'spotlight')).toHaveAttribute('data-overridden', 'false')
  await expect(row.getByTestId('frame-motion-marks')).toHaveCount(0)
})

test('a document beyond the friendly ranges keeps its values when the sliders open', async ({
  page
}) => {
  // The schema allows ±180° and 10s; the sliders show 45°/3s unless a frame asks for more.
  await openDeck(page, [frame(0, 'One'), frame(1, 'Wide', { ms: 5000, roll: 90 })])
  await page.getByTestId('frame-row').nth(1).click()
  await page.getByRole('button', { name: 'Advanced' }).click()

  await expect(page.getByRole('slider', { name: 'Duration' })).toHaveValue('5000')
  await expect(page.getByRole('slider', { name: 'Roll' })).toHaveValue('90')

  // And an ordinary frame still gets the range worth dragging.
  await page.getByTestId('frame-row').first().click()
  await expect(page.getByRole('slider', { name: 'Roll' })).toHaveAttribute('max', '45')
})

test('a preview waits on the frame so the flight can be tuned and replayed', async ({ page }) => {
  await openDeck(page, [frame(0, 'One'), frame(1, 'Two', { ms: 200, roll: 12 })])
  await page.getByTestId('frame-row').nth(1).click()
  const stageRoll = () => stageRollOf(page)

  await page.getByRole('button', { name: 'Play the flight into this frame' }).click()
  // The editor stays put: its panels are what the author is here to adjust.
  await expect(page.getByTestId('preview-controls')).toBeVisible()
  await expect(page.getByTestId('frame-row')).toHaveCount(2)
  await expect.poll(stageRoll, { timeout: 4000 }).toBe(12)

  // Tune the tilt between plays; the same flight shows the new value.
  await page.getByRole('combobox', { name: 'Roll' }).selectOption({ label: 'Left Mid' })
  await page.getByRole('button', { name: 'Play it again' }).click()
  await expect.poll(stageRoll, { timeout: 4000 }).toBe(-15)

  await page.getByRole('button', { name: 'Close the preview' }).click()
  await expect(page.getByTestId('preview-controls')).toHaveCount(0)
  await expect.poll(stageRoll, { timeout: 4000 }).toBe(0)
})

test('a preview rests on the departure frame before it flies', async ({ page }) => {
  await openDeck(page, [frame(0, 'One', { roll: 10 }), frame(1, 'Two', { ms: 200, roll: 12 })])
  await page.getByTestId('frame-row').nth(1).click()
  await expect.poll(async () => (await cameraState(page)).animationActive).toBe(false)
  const editor = await cameraX(page)
  let departure: number | undefined
  for (const name of ['Play the flight into this frame', 'Play it again']) {
    const observation = await observeDepartureHold(page)
    await page.getByRole('button', { name }).click()
    await expect(page.getByTestId('preview-controls')).toBeVisible()
    const measured = await observation.evaluate(({ result }) => result)
    await observation.dispose()
    expect(measured.departureX).not.toBe(editor)
    expect(measured.roll).toBe(10)
    expect(measured.holdMs).toBeGreaterThanOrEqual(500)
    if (departure !== undefined) {
      expect(measured.departureX).toBe(departure)
    }
    departure = measured.departureX
    await expect.poll(async () => (await cameraState(page)).animationActive).toBe(false)
    expect(await stageRollOf(page)).toBe(12)
  }
})

test('picking another frame ends the preview instead of fighting it', async ({ page }) => {
  await openDeck(page, [frame(0, 'One'), frame(1, 'Two', { ms: 200, roll: 12 })])
  await page.getByTestId('frame-row').nth(1).click()
  await page.getByRole('button', { name: 'Play the flight into this frame' }).click()
  await expect(page.getByTestId('preview-controls')).toBeVisible()

  await page.getByTestId('frame-row').first().click()
  await expect(page.getByTestId('preview-controls')).toHaveCount(0)
  // The editor is back: level, lit, and showing the frame that was picked.
  await expect(page.getByTestId('presentation-stage')).toHaveCSS('transform', 'none')
  await expect(page.getByTestId('spotlight-overlay')).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: 'Roll' })).toHaveValue('0')
})

test('the frame list marks only what breaks from the document', async ({ page }) => {
  await openDeck(page, [
    frame(0, 'Plain'),
    frame(1, 'Pinned', { ms: 400 }),
    frame(2, 'Directed', { roll: 12, spotlight: 1 })
  ])
  const rows = page.getByTestId('frame-row')

  await expect(rows.nth(0).getByTestId('frame-motion-marks')).toHaveCount(0)
  // Pinning the value the document already uses presents identically — no mark for that either.
  await expect(rows.nth(1).getByTestId('frame-motion-marks')).toHaveCount(0)
  await expect(rows.nth(2).getByTestId('frame-motion-marks')).toHaveAttribute(
    'aria-label',
    /Roll 12° · Spotlight High/
  )

  // The marks sit inside the row's own button, so they focus the frame like the name does.
  await rows.nth(2).getByTestId('frame-motion-marks').click()
  await expect(rows.nth(2)).toHaveAttribute('data-current', 'true')
})

test('roll tilts the stage while presenting and unwinds on exit', async ({ page }) => {
  await openDeck(page, [frame(0, 'Straight'), frame(1, 'Tilted', { roll: 12, ms: 120 })])

  const stage = page.getByTestId('presentation-stage')
  // Runs in the browser, so the matrix maths is inline rather than a helper from this file.
  const stageRoll = () =>
    stage.evaluate((node) => {
      const m = /matrix\(([-\d.]+),\s*([-\d.]+)/.exec(getComputedStyle(node).transform)
      return m ? Math.round((Math.atan2(Number(m[2]), Number(m[1])) * 180) / Math.PI) : 0
    })
  await expect.poll(stageRoll).toBe(0)

  await page.getByRole('button', { name: 'Slide Show', exact: true }).click()
  await page.waitForTimeout(400)
  await page.keyboard.press('ArrowRight')
  await expect.poll(stageRoll, { timeout: 4000 }).toBe(12)

  await page.keyboard.press('Escape')
  await expect.poll(stageRoll, { timeout: 4000 }).toBe(0)
})

test('spotlight dims outside the frame only while it is asked for', async ({ page }) => {
  await openDeck(page, [frame(0, 'Open'), frame(1, 'Lit', { spotlight: 0.7, ms: 120 })])

  // Not presenting: the overlay is not in the tree at all.
  await expect(page.getByTestId('spotlight-overlay')).toHaveCount(0)

  await page.getByRole('button', { name: 'Slide Show', exact: true }).click()
  await page.waitForTimeout(400)
  const overlay = page.getByTestId('spotlight-overlay')
  await expect(overlay).toHaveCount(1)
  await expect.poll(() => overlay.evaluate((n) => (n as HTMLElement).style.display)).toBe('none')

  await page.keyboard.press('ArrowRight')
  await expect
    .poll(
      () =>
        overlay.evaluate((node) =>
          Number(node.querySelector('path')?.getAttribute('fill-opacity') ?? 0)
        ),
      { timeout: 4000 }
    )
    .toBeGreaterThan(0.6)
})

test('a frame offers no z-order controls, since frames always sit under content', async ({
  page
}) => {
  await openDeck(page, [frame(0, 'One'), frame(1, 'Two')], [shape('box', 200)])
  const front = page.getByRole('button', { name: 'Front', exact: true })
  const backward = page.getByRole('button', { name: 'Backward', exact: true })

  // A selection that includes content still gets them.
  const modifier = (await page.evaluate(() => /Mac/.test(navigator.userAgent))) ? 'Meta' : 'Control'
  await page.getByTestId('canvas-viewport').click({ position: { x: 620, y: 700 } })
  await page.keyboard.press(`${modifier}+a`)
  await expect(front).toHaveCount(1)

  // A frame on its own does not.
  await page.getByTestId('frame-row').first().click()
  await expect(page.getByRole('combobox', { name: 'Duration' })).toBeVisible()
  await expect(front).toHaveCount(0)
  await expect(backward).toHaveCount(0)
})

test('a frame is not offered as something to wrap in another frame', async ({ page }) => {
  await openDeck(page, [frame(0, 'One'), frame(1, 'Two')], [shape('box', 200)])
  const wrap = page.getByRole('button', { name: 'Frame selection', exact: true })

  const modifier = (await page.evaluate(() => /Mac/.test(navigator.userAgent))) ? 'Meta' : 'Control'
  await page.getByTestId('canvas-viewport').click({ position: { x: 620, y: 700 } })
  await page.keyboard.press(`${modifier}+a`)
  await expect(wrap).toHaveCount(1)

  await page.getByTestId('frame-row').first().click()
  await expect(wrap).toHaveCount(0)

  // ⇧F is the same command, so it must not quietly add a slide either.
  await page.keyboard.press('Shift+F')
  await expect(page.getByTestId('frame-row')).toHaveCount(2)
})

test('a slider drag collapses into one undo step', async ({ page }) => {
  await openDeck(page, [frame(0, 'One'), frame(1, 'Two')])
  await page.getByTestId('frame-row').nth(1).click()
  // An edit before the drag: undoing past the drag has to reach this one, not the middle of it.
  await page.getByRole('combobox', { name: 'Spotlight' }).selectOption({ label: 'High' })
  await page.getByRole('button', { name: 'Advanced' }).click()
  const roll = page.getByRole('slider', { name: 'Roll' })
  await expect(roll).toHaveValue('0')

  // Count what the drag really fires, so this cannot pass on a drag that never moved the handle.
  await roll.evaluate((node) => {
    Object.assign(window, { motionEdits: 0 })
    node.addEventListener('input', () => {
      Object.assign(window, { motionEdits: (window as { motionEdits?: number }).motionEdits! + 1 })
    })
  })
  const track = (await roll.boundingBox())!
  const y = track.y + track.height / 2
  await page.mouse.move(track.x + track.width / 2, y)
  await page.mouse.down()
  for (let step = 1; step <= 8; step += 1) {
    await page.mouse.move(track.x + track.width / 2 + step * 4, y)
  }
  await page.mouse.up()

  const edits = await page.evaluate(() => (window as { motionEdits?: number }).motionEdits ?? 0)
  expect(edits).toBeGreaterThan(1)
  expect(Number(await roll.inputValue())).toBeGreaterThan(0)

  // Why: the shortcut is ignored while an input holds focus, so the author has moved on first.
  await roll.blur()
  const undo = async () => {
    await page.keyboard.press('Meta+z')
    await page.keyboard.press('Control+z')
  }
  await undo()
  await expect(roll).toHaveValue('0')
  await expect(motionControl(page, 'spotlight')).toHaveAttribute('data-overridden', 'true')

  // The whole sweep is behind us after one step: the next undo reaches the edit before it, not a
  // snapshot from the middle of the drag.
  await undo()
  await expect(motionControl(page, 'spotlight')).toHaveAttribute('data-overridden', 'false')
  await expect(motionControl(page, 'roll')).toHaveAttribute('data-overridden', 'false')
})
