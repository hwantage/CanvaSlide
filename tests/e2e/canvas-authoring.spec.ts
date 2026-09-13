import { expect, test, type Page } from '@playwright/test'

// Why: shortcuts follow the page's platform (userAgent), not the test runner's OS.
async function primaryModifier(page: Page): Promise<'Meta' | 'Control'> {
  const isMac = await page.evaluate(() => /Mac/.test(navigator.userAgent))
  return isMac ? 'Meta' : 'Control'
}

async function dragOnCanvas(page: Page, from: [number, number], to: [number, number]) {
  const canvas = page.getByTestId('canvas-viewport')
  const box = await canvas.boundingBox()
  if (!box) {
    throw new Error('canvas not laid out')
  }
  await page.mouse.move(box.x + from[0], box.y + from[1])
  await page.mouse.down()
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 8 })
  await page.mouse.up()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('canvas-viewport')).toBeVisible()
})

test('draws a rectangle by dragging and undoes it', async ({ page }) => {
  await page.keyboard.press('r')
  await dragOnCanvas(page, [300, 300], [500, 420])
  const shapes = page.locator('[data-element-type="shape"]')
  await expect(shapes).toHaveCount(1)
  await expect(shapes.first()).toHaveCSS('width', '200px')
  const mod = await primaryModifier(page)
  await page.keyboard.press(`${mod}+z`)
  await expect(shapes).toHaveCount(0)
  await page.keyboard.press(`${mod}+Shift+z`)
  await expect(shapes).toHaveCount(1)
})

test('moves a selected shape by dragging it', async ({ page }) => {
  await page.keyboard.press('r')
  await dragOnCanvas(page, [300, 300], [400, 400])
  const shape = page.locator('[data-element-type="shape"]').first()
  await expect(shape).toHaveCSS('left', '300px')
  await dragOnCanvas(page, [350, 350], [450, 380])
  await expect(shape).toHaveCSS('left', '400px')
  await expect(shape).toHaveCSS('top', '330px')
})

test('creates text with the text tool and types into it', async ({ page }) => {
  await page.keyboard.press('t')
  const canvas = page.getByTestId('canvas-viewport')
  await canvas.click({ position: { x: 400, y: 300 } })
  const editor = page.locator('.canvas-text-editor')
  await expect(editor).toBeFocused()
  await page.keyboard.type('Hello canvas')
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-element-type="text"]')).toContainText('Hello canvas')
})

test('keeps line breaks typed into a text element', async ({ page }) => {
  await page.keyboard.press('t')
  await page.getByTestId('canvas-viewport').click({ position: { x: 400, y: 300 } })
  const editor = page.locator('.canvas-text-editor')
  await expect(editor).toBeFocused()
  await page.keyboard.type('First line')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Second line')
  await page.keyboard.press('Escape')
  const text = page.locator('[data-element-type="text"]')
  await expect(text).toContainText('Second line')
  const rendered = await text.evaluate((element) => (element as HTMLElement).innerText)
  expect(rendered.trim()).toBe('First line\nSecond line')
})

test('zooms with ctrl+wheel around the cursor and shows the level', async ({ page }) => {
  const zoom = page.getByTestId('zoom-level')
  await expect(zoom).toHaveText('100%')
  const canvas = page.getByTestId('canvas-viewport')
  await canvas.hover({ position: { x: 500, y: 400 } })
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -400)
  await page.keyboard.up('Control')
  await expect(zoom).not.toHaveText('100%')
  const level = Number.parseInt((await zoom.textContent()) ?? '0', 10)
  expect(level).toBeGreaterThan(100)
})

test('pastes an image from the clipboard into the viewport', async ({ page }) => {
  const pasteImage = async () =>
    page.evaluate(async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 300
      canvas.height = 150
      canvas.getContext('2d')?.fillRect(0, 0, 300, 150)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) {
        throw new Error('no blob')
      }
      const data = new DataTransfer()
      data.items.add(new File([blob], 'shot.png', { type: 'image/png' }))
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
    })
  await pasteImage()
  const image = page.locator('[data-element-type="image"]')
  await expect(image).toHaveCount(1)
  await expect(image).toHaveCSS('width', '300px')
  // A second paste of the same image must not stack exactly on the first.
  await pasteImage()
  await expect(image).toHaveCount(2)
  const [first, second] = await image.evaluateAll((nodes) =>
    nodes.map((n) => [
      Number.parseFloat((n as HTMLElement).style.left),
      Number.parseFloat((n as HTMLElement).style.top)
    ])
  )
  expect(second?.[0]).toBeCloseTo((first?.[0] ?? 0) + 24, 5)
  expect(second?.[1]).toBeCloseTo((first?.[1] ?? 0) + 24, 5)
})

test('an image copied outside the app pastes even after an in-app copy', async ({ page }) => {
  const mod = await primaryModifier(page)
  await page.keyboard.press('r')
  await dragOnCanvas(page, [300, 300], [400, 400])
  await page.keyboard.press(`${mod}+c`)
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 120
    canvas.height = 80
    canvas.getContext('2d')?.fillRect(0, 0, 120, 80)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) {
      throw new Error('no blob')
    }
    const data = new DataTransfer()
    data.items.add(new File([blob], 'external.png', { type: 'image/png' }))
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  })
  await expect(page.locator('[data-element-type="image"]')).toHaveCount(1)
  await expect(page.locator('[data-element-type="shape"]')).toHaveCount(1)
})

test('runs a presentation across frames with animated camera moves', async ({ page }) => {
  await page.keyboard.press('f')
  await dragOnCanvas(page, [100, 150], [400, 320])
  await page.keyboard.press('f')
  await dragOnCanvas(page, [700, 500], [1000, 800])
  await expect(page.locator('[data-element-type="frame"]')).toHaveCount(2)

  const world = page.getByTestId('world-layer')
  const before = await world.evaluate((el) => el.style.transform)
  await page.getByRole('button', { name: 'Slide Show', exact: true }).click()
  const counter = page.getByTestId('presentation-counter')
  await expect(counter).toContainText('1 / 2')
  await expect.poll(() => world.evaluate((el) => el.style.transform)).not.toBe(before)

  await page.keyboard.press('ArrowRight')
  await expect(counter).toContainText('2 / 2')
  // Camera keeps changing while the tween runs, then settles.
  await page.waitForTimeout(300)
  const mid = await world.evaluate((el) => el.style.transform)
  await page.waitForTimeout(1200)
  const settled = await world.evaluate((el) => el.style.transform)
  expect(mid).not.toBe(settled)

  await page.keyboard.press('Escape')
  await expect(counter).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Slide Show', exact: true })).toBeVisible()
})

test('reorders frames by dragging rows and renames inline', async ({ page }) => {
  await page.keyboard.press('f')
  await dragOnCanvas(page, [100, 150], [300, 300])
  await page.keyboard.press('f')
  await dragOnCanvas(page, [500, 150], [700, 300])
  const rows = page.getByTestId('frame-row')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('Frame 1')
  await rows.nth(1).dragTo(rows.nth(0))
  await expect(rows.nth(0)).toContainText('Frame 2')
  await expect(rows.nth(1)).toContainText('Frame 1')
  await rows.nth(0).getByText('Frame 2').dblclick()
  const input = page.getByRole('textbox', { name: 'Frame name' })
  await input.fill('Intro')
  await input.press('Enter')
  await expect(rows.nth(0)).toContainText('Intro')
  await expect(page.locator('[data-element-type="frame"]', { hasText: 'Intro' })).toHaveCount(1)
  // Clicking a row selects the frame (pink outline) and flies the camera to it.
  const world = page.getByTestId('world-layer')
  const before = await world.evaluate((el) => el.style.transform)
  await rows.nth(1).getByText('Frame 1').click()
  await expect(rows.nth(1)).toHaveAttribute('data-current', 'true')
  await expect.poll(() => world.evaluate((el) => el.style.transform)).not.toBe(before)
  await expect(page.locator('[data-element-type="frame"]', { hasText: 'Frame 1' })).toHaveCount(1)
})

test('double-clicking a frame title on the canvas renames it inline', async ({ page }) => {
  await page.keyboard.press('f')
  await dragOnCanvas(page, [100, 150], [300, 300])
  await page.keyboard.press('v')
  const frame = page.locator('[data-element-type="frame"]').first()
  await expect(frame).toContainText('Frame 1')
  // The title strip sits just above the frame's top edge.
  const canvas = page.getByTestId('canvas-viewport')
  await canvas.dblclick({ position: { x: 150, y: 140 } })
  const editor = page.getByTestId('frame-name-editor')
  await expect(editor).toBeFocused()
  await editor.fill('Opening')
  await editor.press('Enter')
  await expect(editor).toHaveCount(0)
  await expect(frame).toContainText('Opening')
  await expect(page.getByTestId('frame-row').first()).toContainText('Opening')
  // Escape discards the draft.
  await canvas.dblclick({ position: { x: 150, y: 140 } })
  await page.getByTestId('frame-name-editor').fill('Discarded')
  await page.getByTestId('frame-name-editor').press('Escape')
  await expect(frame).toContainText('Opening')
  // Undo reverts the rename in one step.
  await page.keyboard.press(`${await primaryModifier(page)}+z`)
  await expect(frame).toContainText('Frame 1')
})

test('resizes a shape from the south-east handle', async ({ page }) => {
  await page.keyboard.press('r')
  await dragOnCanvas(page, [300, 300], [400, 400])
  const shape = page.locator('[data-element-type="shape"]').first()
  await expect(shape).toHaveCSS('width', '100px')
  // The SE handle sits on the shape's bottom-right corner in screen space.
  await dragOnCanvas(page, [400, 400], [460, 430])
  await expect(shape).toHaveCSS('width', '160px')
  await expect(shape).toHaveCSS('height', '130px')
})

test('zooming out keeps the layout at 100% and shrinks it with a transform', async ({ page }) => {
  await page.keyboard.press('r')
  await dragOnCanvas(page, [300, 300], [400, 400])
  await page.getByTestId('canvas-viewport').hover({ position: { x: 350, y: 350 } })
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, 600)
  await page.keyboard.up('Control')
  await expect(page.getByTestId('zoom-level')).not.toHaveText('100%')
  await page.waitForTimeout(300)
  // Why: WebKit clamps CSS-zoomed text to a minimum font size; below 100% only transform shrinks.
  const world = page.getByTestId('world-layer')
  expect(await world.evaluate((el) => el.style.transform)).toContain('scale')
  expect(await world.evaluate((el) => (el.firstElementChild as HTMLElement).style.zoom)).toBe('1')
})

test('moving a frame carries the elements inside it', async ({ page }) => {
  await page.keyboard.press('f')
  await dragOnCanvas(page, [200, 200], [600, 500])
  await page.keyboard.press('r')
  await dragOnCanvas(page, [300, 300], [400, 380])
  const shape = page.locator('[data-element-type="shape"]').first()
  await expect(shape).toHaveCSS('left', '300px')
  // Grab the frame by its title strip (just above the frame's top edge).
  await dragOnCanvas(page, [300, 190], [350, 240])
  await expect(page.locator('[data-element-type="frame"]').first()).toHaveCSS('left', '250px')
  await expect(shape).toHaveCSS('left', '350px')
})

test('creation preview follows the cursor, not the top-left corner', async ({ page }) => {
  await page.keyboard.press('r')
  const canvas = page.getByTestId('canvas-viewport')
  const box = await canvas.boundingBox()
  if (!box) {
    throw new Error('canvas not laid out')
  }
  await page.mouse.move(box.x + 500, box.y + 400)
  await page.mouse.down()
  await page.mouse.move(box.x + 650, box.y + 480, { steps: 5 })
  const preview = canvas.locator('.border-dashed')
  await expect(preview).toHaveCSS('left', '500px')
  await expect(preview).toHaveCSS('top', '400px')
  await expect(preview).toHaveCSS('width', '150px')
  await page.mouse.up()
})

test('zooming lays elements out at real scale (no bitmap upscaling)', async ({ page }) => {
  await page.keyboard.press('r')
  await dragOnCanvas(page, [300, 300], [400, 400])
  const shape = page.locator('[data-element-type="shape"]').first()
  const before = await shape.boundingBox()
  await page.getByTestId('canvas-viewport').hover({ position: { x: 350, y: 350 } })
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -600)
  await page.keyboard.up('Control')
  await expect
    .poll(async () => (await shape.boundingBox())?.width ?? 0)
    .toBeGreaterThan((before?.width ?? 0) * 1.5)
  // Layout size (not just visual transform) grew: once the zoom settles, the world layer carries
  // no scale() transform.
  await expect
    .poll(() => page.getByTestId('world-layer').evaluate((el) => el.style.transform))
    .not.toContain('scale')
})

test('box-selected group moves together, even when grabbed between objects', async ({ page }) => {
  await page.keyboard.press('r')
  await dragOnCanvas(page, [200, 200], [280, 280])
  await page.keyboard.press('r')
  await dragOnCanvas(page, [400, 200], [480, 280])
  const shapes = page.locator('[data-element-type="shape"]')
  await expect(shapes).toHaveCount(2)
  // Marquee around both.
  await dragOnCanvas(page, [150, 150], [550, 350])
  await expect(page.locator('aside h2', { hasText: '2 elements' })).toBeVisible()
  // Grab the empty gap between them (inside the selection bounds) and drag.
  await dragOnCanvas(page, [340, 240], [390, 300])
  await expect(shapes.nth(0)).toHaveCSS('left', '250px')
  await expect(shapes.nth(1)).toHaveCSS('left', '450px')
  await expect(page.locator('aside h2', { hasText: '2 elements' })).toBeVisible()
  // Grabbing one of the selected shapes also moves the whole group.
  await dragOnCanvas(page, [290, 300], [290, 350])
  await expect(shapes.nth(0)).toHaveCSS('top', '310px')
  await expect(shapes.nth(1)).toHaveCSS('top', '310px')
})

test('a frame can be selected by clicking its outline even when its title is covered', async ({
  page
}) => {
  await page.keyboard.press('f')
  await dragOnCanvas(page, [200, 200], [600, 500])
  // Cover the title strip with a shape.
  await page.keyboard.press('r')
  await dragOnCanvas(page, [190, 160], [620, 230])
  await page.getByTestId('canvas-viewport').click({ position: { x: 300, y: 500 } })
  await expect(page.getByRole('heading', { name: 'Frame', exact: true })).toBeVisible()
  // Dragging the outline moves the frame.
  await dragOnCanvas(page, [600, 400], [650, 400])
  await expect(page.locator('[data-element-type="frame"]').first()).toHaveCSS('left', '250px')
})

test('presentation nav buttons work and overview lets you click a frame', async ({ page }) => {
  await page.keyboard.press('f')
  await dragOnCanvas(page, [100, 150], [400, 320])
  await page.keyboard.press('f')
  await dragOnCanvas(page, [700, 500], [1000, 800])
  await page.getByRole('button', { name: 'Slide Show', exact: true }).click()
  const counter = page.getByTestId('presentation-counter')
  await expect(counter).toContainText('1 / 2')
  await page.getByRole('button', { name: 'Next frame (→)' }).click()
  await expect(counter).toContainText('2 / 2')
  await page.getByRole('button', { name: 'Previous frame (←)' }).click()
  await expect(counter).toContainText('1 / 2')
  await page.getByRole('button', { name: 'Overview (O)' }).click()
  const targets = page.getByTestId('overview-frame')
  await expect(targets).toHaveCount(2)
  await targets.nth(1).click()
  await expect(counter).toContainText('2 / 2')
  await expect(targets).toHaveCount(0)
  await page.getByRole('button', { name: 'Exit presentation (Esc)' }).click()
  await expect(counter).toHaveCount(0)
})

test('copies and pastes objects with the keyboard, offset each time', async ({ page }) => {
  const mod = await primaryModifier(page)
  await page.keyboard.press('r')
  await dragOnCanvas(page, [300, 300], [400, 400])
  const shapes = page.locator('[data-element-type="shape"]')
  await page.keyboard.press(`${mod}+c`)
  await page.keyboard.press(`${mod}+v`)
  await expect(shapes).toHaveCount(2)
  await expect(shapes.nth(1)).toHaveCSS('left', '324px')
  await page.keyboard.press(`${mod}+v`)
  await expect(shapes).toHaveCount(3)
  await expect(shapes.nth(2)).toHaveCSS('left', '348px')
  // Cut removes the (pasted, selected) copy and keeps it on the clipboard.
  await page.keyboard.press(`${mod}+x`)
  await expect(shapes).toHaveCount(2)
  await page.keyboard.press(`${mod}+v`)
  await expect(shapes).toHaveCount(3)
})

test('alt-drag and shift+mod-drag duplicate the selection', async ({ page }) => {
  const mod = await primaryModifier(page)
  await page.keyboard.press('r')
  await dragOnCanvas(page, [300, 300], [400, 400])
  const shapes = page.locator('[data-element-type="shape"]')
  await page.keyboard.down('Alt')
  await dragOnCanvas(page, [350, 350], [550, 350])
  await page.keyboard.up('Alt')
  await expect(shapes).toHaveCount(2)
  await expect(shapes.nth(0)).toHaveCSS('left', '300px')
  await expect(shapes.nth(1)).toHaveCSS('left', '500px')
  await page.keyboard.down('Shift')
  await page.keyboard.down(mod)
  await dragOnCanvas(page, [550, 350], [550, 550])
  await page.keyboard.up(mod)
  await page.keyboard.up('Shift')
  await expect(shapes).toHaveCount(3)
  await expect(shapes.nth(2)).toHaveCSS('top', '500px')
})

test('aligns and distributes a multi-selection', async ({ page }) => {
  await page.keyboard.press('r')
  await dragOnCanvas(page, [100, 100], [200, 150])
  await page.keyboard.press('r')
  await dragOnCanvas(page, [400, 300], [450, 400])
  await page.keyboard.press('r')
  await dragOnCanvas(page, [700, 200], [720, 220])
  await dragOnCanvas(page, [50, 50], [800, 500])
  const toolbar = page.getByTestId('alignment-toolbar')
  await expect(toolbar).toBeVisible()
  await toolbar.getByRole('button', { name: 'Align left' }).click()
  const shapes = page.locator('[data-element-type="shape"]')
  for (let i = 0; i < 3; i += 1) {
    await expect(shapes.nth(i)).toHaveCSS('left', '100px')
  }
  await toolbar.getByRole('button', { name: 'Distribute vertically' }).click()
  // span 100..400 (300), occupied 50+100+20=170, gap 65 → the middle box (3rd created) at 100+50+65
  await expect(shapes.nth(2)).toHaveCSS('top', '215px')
  await expect(shapes.nth(1)).toHaveCSS('top', '300px')
})

test('dragging snaps to neighbour edges and to equal spacing, with guides shown', async ({
  page
}) => {
  await page.keyboard.press('r')
  await dragOnCanvas(page, [100, 100], [200, 200])
  await page.keyboard.press('r')
  await dragOnCanvas(page, [300, 100], [400, 200])
  await page.keyboard.press('r')
  await dragOnCanvas(page, [600, 400], [700, 500])
  const shapes = page.locator('[data-element-type="shape"]')
  // Drag the third box so its left edge lands 4px off the first box's left edge → snaps to 100.
  const box = await page.getByTestId('canvas-viewport').boundingBox()
  if (!box) {
    throw new Error('no canvas')
  }
  await page.mouse.move(box.x + 650, box.y + 450)
  await page.mouse.down()
  await page.mouse.move(box.x + 154, box.y + 750, { steps: 10 })
  await expect(page.getByTestId('snap-guide').first()).toBeVisible()
  await page.mouse.up()
  await expect(shapes.nth(2)).toHaveCSS('left', '100px')
  // Equal spacing: boxes at 100 and 300 (gap 100) → dropping near 505 snaps to 500.
  await dragOnCanvas(page, [150, 750], [555, 150])
  await expect(shapes.nth(2)).toHaveCSS('left', '500px')
  await expect(shapes.nth(2)).toHaveCSS('top', '100px')
  // Holding the primary modifier disables snapping. (On a macOS host Chromium turns Ctrl+click
  // into a right-click, so this part only runs where the modifier is Meta or the host isn't macOS.)
  const mod = await primaryModifier(page)
  if (mod === 'Meta' || process.platform !== 'darwin') {
    await page.keyboard.down(mod)
    await dragOnCanvas(page, [550, 150], [553, 150])
    await page.keyboard.up(mod)
    await expect(shapes.nth(2)).toHaveCSS('left', '503px')
  }
})
