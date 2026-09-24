import { expect, test, type Page } from '@playwright/test'
import { appModuleUrl } from './app-module'
import { dragOnCanvas, primaryModifier } from './canvas-gestures'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('canvas-viewport').evaluate((node) => {
    node.addEventListener(
      'pointerdown',
      (event) => {
        node.setAttribute('data-test-pointer', String((event as PointerEvent).pointerId))
      },
      true
    )
  })
})

async function move(page: Page, x: number, y: number) {
  const box = await page.getByTestId('canvas-viewport').boundingBox()
  if (!box) {
    throw new Error('Canvas is not laid out')
  }
  await page.mouse.move(Math.floor(box.x) + x, Math.floor(box.y) + y, { steps: 5 })
}

async function emit(
  page: Page,
  type: string,
  x: number,
  y: number,
  target = 'presentation-stage',
  overrides: Pick<PointerEventInit, 'button' | 'buttons' | 'pointerId' | 'isPrimary'> = {}
) {
  await page.evaluate(
    ({ type, x, y, target, overrides }) => {
      const canvas = document.querySelector('[data-testid="canvas-viewport"]')!
      const box = canvas.getBoundingClientRect()
      const node = document.querySelector(`[data-testid="${target}"]`)!
      node.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: Number(canvas.getAttribute('data-test-pointer')),
          pointerType: 'mouse',
          isPrimary: true,
          clientX: Math.floor(box.x) + x,
          clientY: Math.floor(box.y) + y,
          button: type === 'pointerup' ? 0 : -1,
          buttons: 0,
          ...overrides
        })
      )
    },
    { type, x, y, target, overrides }
  )
}

async function loseCapture(page: Page, x: number, y: number) {
  await page.getByTestId('canvas-viewport').evaluate((node) => {
    node.releasePointerCapture(Number(node.getAttribute('data-test-pointer')))
  })
  // Replay the hardware trace: capture loss and a zero-button move precede the actual release.
  await emit(page, 'lostpointercapture', x, y, 'canvas-viewport')
  await emit(page, 'pointermove', x, y)
}

async function seedSelectionClipboard(page: Page) {
  // Native keyboard selection populates Linux's selection clipboard; DOM selection alone does not.
  await page.getByRole('textbox', { name: 'Document name' }).click()
  await page.keyboard.press(`${await primaryModifier(page)}+a`)
  await page.getByTestId('canvas-viewport').click({ position: { x: 600, y: 600 } })
}

test.describe('pointer lifecycle @core-interaction', () => {
  for (const kind of ['resize', 'connector-end']) {
    test(`clicking a ${kind} handle without moving does not edit the document`, async ({
      page
    }) => {
      await page.keyboard.press(kind === 'resize' ? 'r' : 'l')
      await dragOnCanvas(page, [100, 100], [250, 200])
      const history = () =>
        page.evaluate(async (url) => {
          const { useDocumentStore } = await import(url)
          const state = useDocumentStore.getState()
          return { document: state.document, past: state.past.length }
        }, appModuleUrl('store/document-store.ts'))
      const before = await history()
      await page.getByTestId('canvas-viewport').click({ position: { x: 250, y: 200 } })
      expect(await history()).toEqual(before)
      await page.keyboard.press(`${await primaryModifier(page)}+z`)
      await expect(page.locator('[data-element-id]')).toHaveCount(0)
    })
  }

  test('normal release creates shapes and frames once, and leaves text editable', async ({
    page
  }) => {
    for (const key of ['r', 'o', 'd', 'f']) {
      await page.keyboard.press(key)
      await dragOnCanvas(page, [100, 100], [240, 190])
      await expect(page.locator('[data-element-id]')).toHaveCount(1)
      await page.keyboard.press(`${await primaryModifier(page)}+z`)
      await expect(page.locator('[data-element-id]')).toHaveCount(0)
    }
    await page.keyboard.press('t')
    await page.getByTestId('canvas-viewport').click({ position: { x: 300, y: 300 } })
    const editor = page.locator('.canvas-text-editor')
    await expect(editor).toBeFocused()
    await page.keyboard.type('Editable text')
    await editor.click()
    await expect(editor).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-element-type="text"]')).toHaveText('Editable text')
  })

  for (const tool of ['r', 'o']) {
    for (const target of ['presentation-stage', 'properties-pane']) {
      test(`${tool} completes once after capture loss before release on ${target}`, async ({
        page
      }) => {
        await page.keyboard.press(tool)
        await move(page, 100, 100)
        await page.mouse.down()
        await move(page, 240, 190)
        await loseCapture(page, 250, 200)
        const shapes = page.locator('[data-element-type="shape"]')
        await expect(shapes).toHaveCount(0)
        await emit(page, 'pointerup', 260, 210, target)
        await page.mouse.up()
        await expect(shapes).toHaveCount(1)
        await expect(shapes).toHaveCSS('width', '160px')
        await expect(shapes).toHaveCSS('height', '110px')
        await page.keyboard.press(`${await primaryModifier(page)}+z`)
        await expect(shapes).toHaveCount(0)
        await page.keyboard.press(`${await primaryModifier(page)}+Shift+z`)
        await expect(shapes).toHaveCount(1)
      })
    }
  }

  for (const reason of ['pointercancel', 'Escape', 'blur']) {
    test(`${reason} still cancels after capture loss and permits the next gesture`, async ({
      page
    }) => {
      await page.keyboard.press('o')
      await move(page, 100, 100)
      await page.mouse.down()
      await move(page, 240, 190)
      await loseCapture(page, 240, 190)
      if (reason === 'pointercancel') {
        await emit(page, reason, 240, 190, 'properties-pane')
      } else if (reason === 'Escape') {
        await page.keyboard.press(reason)
      } else {
        await page.evaluate(() => window.dispatchEvent(new Event('blur')))
      }
      await emit(page, 'pointerup', 260, 210, 'properties-pane')
      await page.mouse.up()
      await expect(page.locator('[data-element-id]')).toHaveCount(0)
      await expect(page.getByTestId('canvas-viewport').locator('.border-dashed')).toHaveCount(0)
      await page.keyboard.press('r')
      await dragOnCanvas(page, [300, 300], [450, 400])
      await expect(page.locator('[data-element-id]')).toHaveCount(1)
      await page.keyboard.press(`${await primaryModifier(page)}+z`)
      await expect(page.locator('[data-element-id]')).toHaveCount(0)
    })
  }

  for (const operation of ['move', 'resize']) {
    test(`${operation} uses the final outside release and records one undo step`, async ({
      page
    }) => {
      await page.keyboard.press('r')
      await dragOnCanvas(page, [100, 100], [250, 200])
      const shape = page.locator('[data-element-type="shape"]')
      const before = await shape.boundingBox()
      if (!before) {
        throw new Error('No shape')
      }
      const start = operation === 'resize' ? [250, 200] : [150, 150]
      await move(page, start[0]!, start[1]!)
      await page.mouse.down()
      await move(page, start[0]! + 40, start[1]! + 30)
      await loseCapture(page, start[0]! + 40, start[1]! + 30)
      await emit(page, 'pointermove', start[0]! + 80, start[1]! + 60, 'properties-pane', {
        buttons: 1
      })
      await emit(page, 'pointerup', start[0]! + 100, start[1]! + 80, 'properties-pane')
      await page.mouse.up()
      const after = await shape.boundingBox()
      if (!after) {
        throw new Error('No shape')
      }
      const keys = operation === 'resize' ? (['width', 'height'] as const) : (['x', 'y'] as const)
      expect(after[keys[0]] - before[keys[0]]).toBeCloseTo(100, 0)
      expect(after[keys[1]] - before[keys[1]]).toBeCloseTo(80, 0)
      await page.keyboard.press(`${await primaryModifier(page)}+z`)
      expect(await shape.boundingBox()).toEqual(before)
      await page.keyboard.press(`${await primaryModifier(page)}+z`)
      await expect(shape).toHaveCount(0)
    })
  }

  test('marquee survives capture loss and includes the final release position', async ({
    page
  }) => {
    for (const x of [100, 300]) {
      await page.keyboard.press('r')
      await dragOnCanvas(page, [x, 100], [x + 100, 200])
    }
    await page.keyboard.press('Escape')
    await move(page, 70, 70)
    await page.mouse.down()
    await move(page, 220, 220)
    await expect(page.locator('[data-selection-id]')).toHaveCount(1)
    await loseCapture(page, 220, 220)
    await expect(page.getByTestId('selection-marquee')).toBeVisible()
    await emit(page, 'pointerup', 420, 220, 'properties-pane')
    await page.mouse.up()
    await expect(page.getByTestId('selection-marquee')).toHaveCount(0)
    await expect(page.locator('[data-selection-id]')).toHaveCount(2)
    await move(page, 90, 90)
    await expect(page.locator('[data-selection-id]')).toHaveCount(2)
  })

  test('native mouse release over the properties panel completes after capture is released', async ({
    page
  }) => {
    await page.keyboard.press('r')
    await move(page, 100, 100)
    await page.mouse.down()
    await move(page, 240, 190)
    await page.getByTestId('canvas-viewport').evaluate((node) => {
      node.releasePointerCapture(Number(node.getAttribute('data-test-pointer')))
    })
    const panel = await page.getByTestId('properties-pane').boundingBox()
    const canvas = await page.getByTestId('canvas-viewport').boundingBox()
    if (!panel || !canvas) {
      throw new Error('No panel or canvas')
    }
    const x = Math.floor(panel.x + panel.width / 2)
    const y = Math.floor(panel.y + panel.height / 2)
    await page.mouse.move(x, y, { steps: 5 })
    await page.mouse.up()
    const shape = page.locator('[data-element-type="shape"]')
    await expect(shape).toHaveCount(1)
    await expect(shape).toHaveCSS('width', `${x - Math.floor(canvas.x) - 100}px`)
    await move(page, 300, 300)
    await expect(shape).toHaveCSS('width', `${x - Math.floor(canvas.x) - 100}px`)
    await page.keyboard.press(`${await primaryModifier(page)}+z`)
    await expect(shape).toHaveCount(0)
  })

  test('secondary and middle presses on resize handles cannot resize a selection', async ({
    page
  }) => {
    await page.keyboard.press('r')
    await dragOnCanvas(page, [100, 100], [250, 200])
    const shape = page.locator('[data-element-type="shape"]')
    const before = await shape.boundingBox()
    for (const button of ['right', 'middle'] as const) {
      await move(page, 250, 200)
      await page.mouse.down({ button })
      await move(page, 350, 300)
      await page.mouse.up({ button })
      expect(await shape.boundingBox()).toEqual(before)
      await page.keyboard.press('Escape')
      await page.getByTestId('canvas-viewport').click({ position: { x: 150, y: 150 } })
    }
  })

  for (const button of ['left', 'middle'] as const) {
    test(`${button} pan completes outside after capture loss`, async ({ page }) => {
      await seedSelectionClipboard(page)
      if (button === 'left') {
        await page.keyboard.press('h')
      }
      await move(page, 100, 100)
      await page.mouse.down({ button })
      await move(page, 160, 140)
      await loseCapture(page, 160, 140)
      const panel = await page.getByTestId('properties-pane').boundingBox()
      const canvas = await page.getByTestId('canvas-viewport').boundingBox()
      if (!panel || !canvas) {
        throw new Error('No panel or canvas')
      }
      const x = Math.floor(panel.x + panel.width / 2)
      const y = Math.floor(panel.y + panel.height / 2)
      await page.mouse.move(x, y, { steps: 5 })
      await page.mouse.up({ button })
      await move(page, 400, 400)
      const camera = await page.evaluate(async (url) => {
        const { useCameraStore } = await import(url)
        return useCameraStore.getState().camera
      }, appModuleUrl('store/camera-store.ts'))
      expect(camera).toEqual({
        x: x - Math.floor(canvas.x) - 100,
        y: y - Math.floor(canvas.y) - 100,
        zoom: 1
      })
      await expect(page.locator('[data-element-id]')).toHaveCount(0)
    })
  }

  for (const { cancelled, chorded } of [
    { cancelled: true, chorded: false },
    { cancelled: false, chorded: true },
    { cancelled: true, chorded: true }
  ]) {
    test(`native middle release cannot paste (cancelled=${cancelled}, chorded=${chorded})`, async ({
      page
    }) => {
      await seedSelectionClipboard(page)
      await move(page, 100, 100)
      await page.mouse.down({ button: 'middle' })
      await move(page, 160, 140)
      await loseCapture(page, 160, 140)
      if (chorded) {
        await page.mouse.down({ button: 'left' })
      }
      if (cancelled) {
        await page.keyboard.press('Escape')
      }
      await page.mouse.up({ button: 'middle' })
      if (chorded) {
        await page.mouse.up({ button: 'left' })
      }
      await expect(page.locator('[data-element-id]')).toHaveCount(0)
      await page.keyboard.press('r')
      await dragOnCanvas(page, [300, 300], [450, 400])
      await page.keyboard.press(`${await primaryModifier(page)}+z`)
      await expect(page.locator('[data-element-id]')).toHaveCount(0)
    })
  }

  test('connector creation and endpoint dragging survive capture loss with one undo each', async ({
    page
  }) => {
    await page.keyboard.press('l')
    await move(page, 100, 300)
    await page.mouse.down()
    await move(page, 400, 300)
    await loseCapture(page, 400, 300)
    await emit(page, 'pointerup', 500, 300, 'properties-pane')
    await page.mouse.up()
    const path = page.getByTestId('connector-path')
    const initial = await path.getAttribute('d')
    await expect(page.locator('[data-element-type="connector"]')).toHaveCount(1)
    const handle = page.getByTestId('connector-end-handle')
    await handle.hover()
    await page.mouse.down()
    await move(page, 550, 330)
    await loseCapture(page, 550, 330)
    await emit(page, 'pointerup', 650, 400, 'properties-pane')
    await page.mouse.up()
    await expect(path).not.toHaveAttribute('d', initial!)
    const end = await handle.boundingBox()
    const canvas = await page.getByTestId('canvas-viewport').boundingBox()
    expect(end!.x + end!.width / 2).toBe(Math.floor(canvas!.x) + 650)
    expect(end!.y + end!.height / 2).toBe(Math.floor(canvas!.y) + 400)
    await page.keyboard.press(`${await primaryModifier(page)}+z`)
    await expect(path).toHaveAttribute('d', initial!)
    await page.keyboard.press(`${await primaryModifier(page)}+z`)
    await expect(path).toHaveCount(0)
  })

  test('pointercancel discards a new connector without leaving a pending edit', async ({
    page
  }) => {
    await page.keyboard.press('l')
    await move(page, 100, 300)
    await page.mouse.down()
    await move(page, 400, 300)
    await loseCapture(page, 400, 300)
    await emit(page, 'pointercancel', 400, 300)
    await page.mouse.up()
    await expect(page.locator('[data-element-id]')).toHaveCount(0)
    await page.keyboard.press('r')
    await dragOnCanvas(page, [300, 300], [450, 400])
    await page.keyboard.press(`${await primaryModifier(page)}+z`)
    await expect(page.locator('[data-element-id]')).toHaveCount(0)
  })

  test('other pointers and button releases cannot move, finish, or cancel the active edit', async ({
    page
  }) => {
    await page.keyboard.press('r')
    await move(page, 100, 100)
    await page.mouse.down()
    await move(page, 240, 190)
    for (const type of ['pointerdown', 'pointermove', 'pointercancel', 'pointerup']) {
      await emit(page, type, 500, 500, 'presentation-stage', {
        pointerId: 99,
        isPrimary: false,
        buttons: type === 'pointerup' ? 0 : 1,
        button: 0
      })
    }
    await emit(page, 'pointerup', 500, 500, 'presentation-stage', { button: 2, buttons: 1 })
    await expect(page.locator('[data-element-id]')).toHaveCount(0)
    await page.mouse.up()
    const shape = page.locator('[data-element-type="shape"]')
    await expect(shape).toHaveCount(1)
    await expect(shape).toHaveCSS('width', '140px')
    await expect(shape).toHaveCSS('height', '90px')
  })

  for (const target of ['editor', 'overlay']) {
    test(`releases over a ${target} that stops bubbling still finish the active gesture`, async ({
      page
    }) => {
      await page.getByTestId('canvas-viewport').evaluate((node, target) => {
        const child = document.createElement(target === 'editor' ? 'input' : 'button')
        child.dataset.testid = 'release-target'
        if (target === 'overlay') {
          child.dataset.canvasUi = ''
        }
        child.addEventListener('pointerup', (event) => event.stopPropagation())
        node.append(child)
      }, target)
      await page.keyboard.press('r')
      await emit(page, 'pointerdown', 100, 100, 'release-target', {
        button: 0,
        buttons: 1,
        pointerId: 99
      })
      await emit(page, 'pointerup', 200, 200, 'release-target', { pointerId: 99 })
      await expect(page.locator('[data-element-id]')).toHaveCount(0)
      await move(page, 100, 100)
      await page.mouse.down()
      await move(page, 240, 190)
      await loseCapture(page, 240, 190)
      await emit(page, 'pointerup', 260, 210, 'release-target')
      await page.mouse.up()
      await expect(page.locator('[data-element-id]')).toHaveCount(1)
    })
  }
})
