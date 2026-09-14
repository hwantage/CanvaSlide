import { expect, test, type Locator } from '@playwright/test'

const height = (locator: Locator) => locator.evaluate((el) => el.getBoundingClientRect().height)

test('the side panel splits frames and properties with a draggable, clamped handle', async ({
  page
}) => {
  await page.goto('/')
  const frames = page.getByTestId('frames-pane')
  const props = page.getByTestId('properties-pane')
  const handle = page.getByTestId('panel-split-handle')
  await expect(props).toContainText('Select an element')
  const before = await height(frames)
  const box = (await handle.boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx, cy + 150, { steps: 5 })
  await page.mouse.up()
  expect(Math.abs((await height(frames)) - (before + 150))).toBeLessThan(2)

  // Dragging far down stops where the properties pane keeps its minimum height.
  await page.mouse.move(cx, cy + 150)
  await page.mouse.down()
  await page.mouse.move(cx, cy + 2000, { steps: 5 })
  await page.mouse.up()
  expect(await height(props)).toBeGreaterThanOrEqual(200)
  const panelHeight = await height(page.getByTestId('side-panel'))
  expect(await height(frames)).toBeLessThan(panelHeight - 200)

  // Dragging far up stops at the frames pane minimum, and the value survives a reload.
  const top = (await handle.boundingBox())!
  await page.mouse.move(top.x + 10, top.y + 4)
  await page.mouse.down()
  await page.mouse.move(top.x + 10, 0, { steps: 5 })
  await page.mouse.up()
  expect(Math.abs((await height(frames)) - 120)).toBeLessThan(2)
  await page.reload()
  expect(Math.abs((await height(page.getByTestId('frames-pane'))) - 120)).toBeLessThan(2)

  // Keyboard: arrows move the split too.
  await page.getByTestId('panel-split-handle').focus()
  await page.keyboard.press('ArrowDown')
  expect(Math.abs((await height(page.getByTestId('frames-pane'))) - 144)).toBeLessThan(2)
})

test('each pane scrolls on its own when its content overflows', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('panel-split-handle').focus()
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('ArrowUp')
  }
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('f')
    await page.getByTestId('canvas-viewport').click({ position: { x: 200 + i * 40, y: 200 } })
  }
  const frames = page.getByTestId('frames-pane')
  const overflow = await frames.evaluate((el) => ({
    scroll: el.scrollHeight,
    client: el.clientHeight,
    overflowY: getComputedStyle(el).overflowY
  }))
  expect(overflow.scroll).toBeGreaterThan(overflow.client)
  expect(overflow.overflowY).toBe('auto')
  await expect(page.getByTestId('properties-pane')).toHaveCSS('overflow-y', 'auto')
})

test('dragging a frame row shows an insertion line between rows and auto-scrolls the pane', async ({
  page
}) => {
  await page.goto('/')
  await page.getByTestId('panel-split-handle').focus()
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('ArrowUp')
  }
  for (let i = 0; i < 10; i += 1) {
    await page.keyboard.press('f')
    await page.getByTestId('canvas-viewport').click({ position: { x: 200 + i * 40, y: 200 } })
  }
  const rows = page.getByTestId('frame-row')
  await expect(rows).toHaveCount(10)
  // Synthetic HTML5 drag: start on row 5, hover the lower half of row 1 → line below row 1.
  const dragOver = (rowIndex: number, where: 'upper' | 'lower') =>
    page.evaluate(
      ({ rowIndex, where }) => {
        const rowsEl = [...document.querySelectorAll('[data-testid="frame-row"]')] as HTMLElement[]
        const source = rowsEl[5]!
        const target = rowsEl[rowIndex]!
        const data = new DataTransfer()
        source.dispatchEvent(new DragEvent('dragstart', { dataTransfer: data, bubbles: true }))
        const rect = target.getBoundingClientRect()
        const y = where === 'upper' ? rect.top + 3 : rect.bottom - 3
        target.dispatchEvent(
          new DragEvent('dragover', {
            dataTransfer: data,
            bubbles: true,
            cancelable: true,
            clientY: y,
            clientX: rect.left + 10
          })
        )
      },
      { rowIndex, where }
    )
  const indicator = page.getByTestId('frame-drop-indicator')
  await dragOver(1, 'lower')
  await expect(indicator).toHaveCount(1)
  // Lower half of row 1 = gap 2, drawn at the top edge of row 2 ("Frame 3").
  await expect(rows.nth(2).getByTestId('frame-drop-indicator')).toHaveCount(1)
  // No line right around the dragged row itself.
  await dragOver(5, 'upper')
  await expect(indicator).toHaveCount(0)

  // Auto-scroll: a dragover near the pane's top edge scrolls the pane up.
  const pane = page.getByTestId('frames-pane')
  await pane.evaluate((el) => {
    el.scrollTop = 200
  })
  const before = await pane.evaluate((el) => el.scrollTop)
  expect(before).toBeGreaterThan(0)
  await page.evaluate(() => {
    const pane = document.querySelector('[data-testid="frames-pane"]') as HTMLElement
    const rect = pane.getBoundingClientRect()
    const row = document.querySelector('[data-testid="frame-row"]') as HTMLElement
    const data = new DataTransfer()
    row.dispatchEvent(new DragEvent('dragstart', { dataTransfer: data, bubbles: true }))
    document.dispatchEvent(
      new DragEvent('dragover', {
        dataTransfer: data,
        bubbles: true,
        cancelable: true,
        clientY: rect.top + 5,
        clientX: rect.left + 10
      })
    )
  })
  // Why: scrolling continues every frame while the pointer stays in the edge zone.
  await expect.poll(() => pane.evaluate((el) => el.scrollTop)).toBe(0)
  await page.evaluate(() => {
    const row = document.querySelector('[data-testid="frame-row"]') as HTMLElement
    row.dispatchEvent(new DragEvent('dragend', { bubbles: true }))
  })
  await page.waitForTimeout(100)
  const after = await pane.evaluate((el) => el.scrollTop)
  expect(after).toBe(0)
  expect(before).toBeGreaterThan(after)
})

test('a real mouse drag held at the pane edge scrolls hidden rows into reach', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('panel-split-handle').focus()
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('ArrowUp')
  }
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('f')
    await page.getByTestId('canvas-viewport').click({ position: { x: 200 + i * 30, y: 200 } })
  }
  const pane = page.getByTestId('frames-pane')
  await pane.evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  const before = await pane.evaluate((el) => el.scrollTop)
  expect(before).toBeGreaterThan(0)
  const last = page.getByTestId('frame-row').last()
  const box = (await last.boundingBox())!
  const paneBox = (await pane.boundingBox())!
  await page.mouse.move(box.x + 20, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 20, box.y + 5, { steps: 3 })
  await page.mouse.move(box.x + 20, paneBox.y + 6, { steps: 10 })
  await expect.poll(() => pane.evaluate((el) => el.scrollTop), { timeout: 3000 }).toBe(0)
  // Drop onto the first gap: the last frame becomes the first.
  const first = page.getByTestId('frame-row').first()
  const firstBox = (await first.boundingBox())!
  await page.mouse.move(firstBox.x + 20, firstBox.y + 3, { steps: 3 })
  await page.mouse.up()
  await expect(page.getByTestId('frame-row').first()).toContainText('Frame 12')
})
