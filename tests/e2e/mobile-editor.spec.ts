import { readFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { createEmptyDocument, type CanvasDocument } from '../../src/shared/canvas/element-types'
import { encodeDocumentFixture, readSavedDocument } from './saved-document'
import { waitForOverview } from './presentation-fixture'

const shareId = 'abcdefghijklmnopqr_-1'

function mobileDocument(): CanvasDocument {
  const document = createEmptyDocument()
  document.name = 'Mobile presentation'
  document.settings.transitionMs = 0
  for (let index = 0; index < 3; index++) {
    const id = `frame-${index}`
    document.elements[id] = {
      id,
      type: 'frame',
      name: `Scene ${index + 1}`,
      order: index,
      x: index * 640,
      y: 0,
      width: 600,
      height: 400
    }
    document.order.push(id)
  }
  return document
}

async function openShared(page: Page, access: 'edit' | 'present' = 'edit') {
  await page.route('**/api/share/*', (route) =>
    route.fulfill({ json: { access, document: mobileDocument() } })
  )
  await page.goto(`/?share=${shareId}`)
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

async function action(page: Page, name: string) {
  await page.getByRole('button', { name: 'Actions menu', exact: true }).tap()
  await contained(page.getByRole('menu', { name: 'Actions menu' }), page)
  await page.getByRole('menuitem', { name, exact: true }).tap()
}

async function contained(locator: Locator, page: Page) {
  await expect(locator).toBeVisible()
  const box = (await locator.boundingBox())!
  const viewport = page.viewportSize()!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1)
  expect(
    await locator.evaluate((element) => element.scrollWidth - element.clientWidth)
  ).toBeLessThanOrEqual(1)
}

test.describe('compact editor', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('menus support arrows, Tab, dismissal and dialog focus return @core-interaction', async ({
    page
  }) => {
    await page.goto('/')
    const file = page.getByRole('button', { name: 'File menu', exact: true })
    const actions = page.getByRole('button', { name: 'Actions menu', exact: true })
    const slideshow = page.getByRole('button', { name: 'Slide Show', exact: true })
    await contained(slideshow, page)
    await expect(slideshow).toBeDisabled()
    await expect(slideshow).toHaveAttribute('title', 'Add a frame first (F)')
    await expect(page.getByTestId('side-panel')).toBeHidden()
    await contained(page.getByRole('banner'), page)
    await file.focus()
    await page.keyboard.press('ArrowUp')
    await expect(page.getByRole('menuitem', { name: 'Save as…', exact: true })).toBeFocused()
    await page.keyboard.press('Home')
    await expect(page.getByRole('menuitem').first()).toBeFocused()
    await page.keyboard.press('End')
    await expect(page.getByRole('menuitem').last()).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(file).toBeFocused()
    await expect(page.getByRole('menu')).toHaveCount(0)
    await actions.focus()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('menuitem', { name: 'Create with AI' })).toBeFocused()
    await page.keyboard.press('Enter')
    const guide = page.getByRole('dialog', { name: 'Create with AI and CanvaSlide' })
    await contained(guide, page)
    await expect(guide.getByRole('checkbox', { name: 'Generate an HTML file' })).not.toBeChecked()
    await page.keyboard.press('Escape')
    await expect(actions).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('menuitem', { name: 'Keyboard shortcuts' })).toBeFocused()
    await page.keyboard.press('End')
    await page.keyboard.press('ArrowUp')
    await expect(page.getByRole('menuitem', { name: 'Settings', exact: true })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(actions).toBeFocused()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('menu')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Open panels' })).toBeFocused()
    await actions.focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Shift+Tab')
    await expect(page.getByRole('textbox', { name: 'Document name' })).toBeFocused()
    await actions.tap()
    await page.touchscreen.tap(15, 400)
    await expect(page.getByRole('menu')).toHaveCount(0)
    await file.tap()
    await actions.tap()
    await expect(page.getByRole('menu')).toHaveCount(1)
    await expect(page.getByRole('menu', { name: 'Actions menu' })).toBeVisible()
  })

  test('Escape cancels a frame rename before closing panels and respects IME @core-interaction', async ({
    page
  }) => {
    await openShared(page)
    const panel = page.getByTestId('side-panel')
    const firstFrame = page.getByTestId('frame-row').first()
    await page.getByRole('button', { name: 'Open panels' }).tap()
    await firstFrame.getByText('Scene 1', { exact: true }).dblclick()
    const editor = page.getByTestId('frame-name-editor')
    await editor.fill('Cancelled draft')
    await page.keyboard.press('Escape')
    await expect(editor).toHaveCount(0)
    await expect(panel).toBeVisible()
    await expect(firstFrame).toContainText('Scene 1')
    await expect(firstFrame).not.toContainText('Cancelled draft')
    await expect(page.getByRole('button', { name: /^Undo/ })).toBeDisabled()

    const split = page.getByRole('separator')
    await split.focus()
    await split.dispatchEvent('keydown', { key: 'Escape', isComposing: true })
    await expect(panel).toBeVisible()
    await split.dispatchEvent('keydown', { key: 'Escape', keyCode: 229 })
    await expect(panel).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await expect(page.getByRole('button', { name: 'Open panels' })).toBeFocused()
  })

  test('panels recover their split, retain edits, reorder and select frames by touch @core-interaction', async ({
    page
  }) => {
    await openShared(page)
    const panel = page.getByTestId('side-panel')
    const canvas = page.getByTestId('canvas-viewport')
    expect((await canvas.boundingBox())!.width).toBe(390)
    await page.getByRole('button', { name: 'Open panels' }).tap()
    await expect(panel).toBeVisible()
    await expect
      .poll(async () => (await page.getByTestId('frames-pane').boundingBox())!.height)
      .toBeGreaterThan(200)
    const rows = page.getByTestId('frame-row')
    await rows.nth(1).getByRole('button').first().tap()
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Touch scene')
    await page.getByRole('button', { name: 'Move selected frame up', exact: true }).tap()
    await expect(rows.first()).toContainText('Touch scene')
    await page.getByRole('button', { name: /^Undo/ }).tap()
    await expect(rows.nth(1)).toContainText('Touch scene')
    const split = page.getByRole('separator')
    await split.focus()
    await page.keyboard.press('ArrowDown')
    const height = await split.getAttribute('aria-valuenow')
    await page.getByRole('button', { name: 'Close panels' }).tap()
    await expect(panel).toBeHidden()
    await page.getByRole('button', { name: 'Open panels' }).tap()
    await expect(split).toHaveAttribute('aria-valuenow', height!)
    await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(
      'Touch scene'
    )
    await page.getByRole('button', { name: 'Select multiple frames', exact: true }).tap()
    await rows.first().getByRole('button').first().tap()
    await expect(rows.locator('button[aria-pressed="true"]')).toHaveCount(2)
    await page.getByRole('button', { name: 'Slide Show', exact: true }).tap()
    await expect(page.getByTestId('presentation-controls')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('banner')).toBeVisible()
    await expect(panel).toBeVisible()
    await action(page, 'Settings')
    await page.keyboard.press('Escape')
    await expect(panel).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await expect(page.getByRole('button', { name: 'Open panels' })).toBeFocused()
    await page.getByRole('button', { name: 'Open panels' }).tap()
    await page.touchscreen.tap(15, 400)
    await expect(panel).toBeHidden()
    await page.setViewportSize({ width: 1400, height: 900 })
    await expect(panel).toBeVisible()
    await expect(page.getByRole('button', { name: 'File menu', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Close panels' }).click()
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(panel).toBeHidden()
    await page.setViewportSize({ width: 1400, height: 900 })
    await expect(panel).toBeHidden()
  })

  for (const width of [320, 390]) {
    test(`Slide Show starts beside a long document title at ${width}px @core-interaction`, async ({
      page
    }) => {
      await page.setViewportSize({ width, height: 844 })
      await openShared(page)
      const title = page.getByRole('textbox', { name: 'Document name' })
      await title.fill('A long mobile presentation title that must not hide the Slide Show button')
      const slideshow = page.getByRole('button', { name: 'Slide Show', exact: true })
      await expect(slideshow).toBeEnabled()
      await contained(page.getByRole('banner'), page)
      await contained(slideshow, page)
      const titleBox = (await title.boundingBox())!
      const buttonBox = (await slideshow.boundingBox())!
      expect(buttonBox.x).toBeGreaterThanOrEqual(titleBox.x + titleBox.width)
      expect(buttonBox.width).toBeGreaterThanOrEqual(44)
      expect(buttonBox.height).toBeGreaterThanOrEqual(44)
      await expect(page.getByRole('menu')).toHaveCount(0)
      await slideshow.tap()
      await expect(page.getByTestId('presentation-controls')).toBeVisible()
      await expect(page.getByTestId('presentation-counter')).toContainText('1 / 3')
      await page.getByRole('button', { name: /Next frame/ }).tap()
      await expect(page.getByTestId('presentation-counter')).toContainText('2 / 3')
      await page.getByRole('button', { name: /^Exit/ }).tap()
      await expect(slideshow).toBeVisible()
      await slideshow.focus()
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('presentation-counter')).toContainText('1 / 3')
      await page.keyboard.press('Escape')
      await expect(slideshow).toBeVisible()
      await page.getByRole('button', { name: 'Actions menu', exact: true }).tap()
      await expect(page.getByRole('menuitem', { name: 'Slide Show', exact: true })).toHaveCount(0)
      await page.keyboard.press('Escape')
      await page.setViewportSize({ width: 1400, height: 900 })
      await expect(slideshow).toHaveCount(1)
      await expect(slideshow).toHaveText('Slide Show')
    })
  }

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 844, height: 320 }
  ]) {
    test(`dialogs, menus and presentation fit ${viewport.width}×${viewport.height} @core-interaction`, async ({
      page
    }) => {
      await page.setViewportSize(viewport)
      await openShared(page)
      for (const name of ['Keyboard shortcuts', 'Settings', 'About CanvaSlide', 'Share']) {
        await action(page, name)
        await contained(
          page.getByRole('dialog', { name, exact: true }).locator(':scope > div'),
          page
        )
        await page.keyboard.press('Escape')
      }
      await page.getByRole('button', { name: 'Insert video link', exact: true }).tap()
      await contained(page.getByRole('dialog').locator(':scope > div'), page)
      await page.keyboard.press('Escape')
      await action(page, 'Share')
      await page.getByRole('button', { name: 'Export HTML', exact: true }).tap()
      await contained(page.locator('dialog').last().locator(':scope > div'), page)
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog', { name: 'Share', exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Slide Show', exact: true }).tap()
      await contained(page.getByTestId('presentation-controls'), page)
      await page.getByRole('button', { name: /Next frame/ }).tap()
      await expect(page.getByTestId('presentation-counter')).toContainText('2 / 3')
      await page.getByRole('button', { name: /^Exit/ }).tap()
      await page.getByRole('button', { name: 'Open panels' }).tap()
      await page.getByTestId('frame-row').first().getByRole('button').first().tap()
      await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Rotated scene')
      await expect(page.getByTestId('frame-row').first()).toContainText('Rotated scene')
      await page.getByRole('button', { name: 'Play the flight into this frame', exact: true }).tap()
      await page.getByRole('button', { name: 'Close panels' }).tap()
      await contained(page.getByTestId('preview-controls'), page)
      await page.getByRole('button', { name: 'Play it again', exact: true }).tap()
      await page.getByRole('button', { name: 'Close the preview', exact: true }).tap()
      await expect(page.getByTestId('preview-controls')).toHaveCount(0)
    })
  }

  test('touch draws and pans the canvas with undo and reachable file commands', async ({
    page,
    browserName
  }) => {
    test.skip(browserName !== 'chromium', 'Native touch movement uses Chromium CDP')
    await page.goto('/')
    const client = await page.context().newCDPSession(page)
    const drag = async (from: [number, number], to: [number, number]) => {
      const movement = await page.evaluateHandle(() => {
        const points: { start?: [number, number]; end?: [number, number] } = {}
        window.addEventListener(
          'pointerdown',
          (event) => (points.start = [event.clientX, event.clientY]),
          { once: true, capture: true }
        )
        window.addEventListener(
          'pointerup',
          (event) => (points.end = [event.clientX, event.clientY]),
          { once: true, capture: true }
        )
        return points
      })
      // Queued native gestures keep Linux Chromium's next tap from losing its click.
      await client.send('Input.synthesizeScrollGesture', {
        x: from[0],
        y: from[1],
        xDistance: to[0] - from[0],
        yDistance: to[1] - from[1],
        gestureSourceType: 'touch',
        preventFling: true
      })
      const { start, end } = await movement.jsonValue()
      await movement.dispose()
      expect(start).toBeDefined()
      expect(end).toBeDefined()
      // Chromium adds touch slop; verify geometry against the delivered pointer movement.
      return { x: end![0] - start![0], y: end![1] - start![1] }
    }
    await page.getByRole('button', { name: 'Rectangle (R)', exact: true }).tap()
    const drawnBy = await drag([70, 240], [270, 380])
    const shape = page.locator('[data-element-type="shape"]')
    await expect(shape).toHaveCount(1)
    const drawn = (await shape.boundingBox())!
    expect(drawnBy.x).toBeGreaterThanOrEqual(200)
    expect(drawnBy.y).toBeGreaterThanOrEqual(140)
    expect(drawn.width).toBeCloseTo(drawnBy.x, 0)
    expect(drawn.height).toBeCloseTo(drawnBy.y, 0)
    await page.getByRole('button', { name: /^Undo/ }).tap()
    await expect(shape).toHaveCount(0)
    await page.getByRole('button', { name: /^Redo/ }).tap()
    await expect(shape).toHaveCount(1)
    const before = (await shape.boundingBox())!
    await page.getByRole('button', { name: 'Hand (pan) (H)', exact: true }).tap()
    const pannedBy = await drag([100, 450], [150, 500])
    await expect
      .poll(async () => (await shape.boundingBox())!.x)
      .toBeCloseTo(before.x + pannedBy.x, 0)
    await expect
      .poll(async () => (await shape.boundingBox())!.y)
      .toBeCloseTo(before.y + pannedBy.y, 0)
    await page.getByRole('button', { name: /Zoom in/ }).tap()
    await expect(page.getByTestId('zoom-level')).not.toHaveText('100%')
    for (const name of ['Save', 'Save as…']) {
      await page.getByRole('button', { name: 'File menu', exact: true }).tap()
      const download = page.waitForEvent('download')
      await page.getByRole('menuitem', { name, exact: true }).tap()
      const saved = readSavedDocument(await readFile((await (await download).path())!))
      expect(saved.order).toHaveLength(1)
    }
    await page.getByRole('button', { name: 'File menu', exact: true }).tap()
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('menuitem', { name: /Open/, exact: false }).tap()
    await (
      await chooser
    ).setFiles({
      name: 'mobile.canvaslide',
      mimeType: 'application/json',
      buffer: encodeDocumentFixture(mobileDocument())
    })
    await expect(page.getByRole('textbox', { name: 'Document name' })).toHaveValue(
      'Mobile presentation'
    )
    await page.getByRole('button', { name: 'File menu', exact: true }).tap()
    await page.getByRole('menuitem', { name: /New/, exact: false }).tap()
    await expect(page.getByRole('textbox', { name: 'Document name' })).toHaveValue('Untitled')
  })

  test('mobile shared viewers can navigate and editable copies can publish @core-interaction', async ({
    page
  }) => {
    await openShared(page, 'present')
    await expect(page.getByTestId('shared-slide-show')).toBeVisible()
    await contained(page.getByTestId('presentation-controls'), page)
    await page.getByRole('button', { name: /Next frame/ }).tap()
    await expect(page.getByTestId('presentation-counter')).toContainText('2 / 3')
    await page.getByRole('button', { name: /Overview/ }).tap()
    await waitForOverview(page.getByTestId('overview-frame'), 3)
    await page.getByTestId('overview-frame').last().tap()
    await expect(page.getByTestId('presentation-counter')).toContainText('3 / 3')
    await expect(page.getByRole('button', { name: /^Exit/ })).toHaveCount(0)
    await page.unroute('**/api/share/*')
    await openShared(page)
    await page.getByRole('textbox', { name: 'Document name' }).fill('Mobile copy')
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async () => {} }
      })
    })
    const uploads: { access: string; document: CanvasDocument }[] = []
    await page.route('**/api/share', async (route) => {
      uploads.push(route.request().postDataJSON())
      await route.fulfill({ json: { id: shareId } })
    })
    await action(page, 'Share')
    await page.getByRole('radio', { name: 'Edit a copy', exact: true }).check()
    await page.getByRole('button', { name: 'Copy link', exact: true }).tap()
    await expect(page.getByRole('textbox', { name: 'Shareable URL' })).toHaveValue(/\?share=/)
    expect(uploads[0]?.access).toBe('edit')
    expect(uploads[0]?.document.name).toBe('Mobile copy')
  })
})
