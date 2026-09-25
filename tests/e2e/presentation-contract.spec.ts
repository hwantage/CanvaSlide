import { expect, test } from '@playwright/test'
import { appModuleUrl } from './app-module'
import { dragOnCanvas } from './canvas-gestures'
import {
  downloadPresentation,
  inkEndpoints,
  inkStrokes,
  openPresentation,
  presentationControls,
  revealControls,
  sendPointer
} from './presentation-fixture'

for (const surface of ['app', 'html'] as const) {
  test.describe(`${surface} shared presentation contract`, () => {
    test('one frame has no out-of-range navigation and can return from overview @core-interaction', async ({
      page
    }) => {
      await openPresentation(page, surface, { count: 1 })
      const controls = presentationControls(page)
      const previous = controls.getByRole('button', { name: /^Previous/ })
      const next = controls.getByRole('button', { name: /^Next/ })
      await expect(previous).toBeDisabled()
      await expect(next).toBeDisabled()
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowLeft')
      await expect(page.getByTestId('presentation-counter')).toContainText('1 / 1')
      await page.keyboard.press('o')
      await expect(next).toBeEnabled()
      await next.click()
      await expect(next).toBeDisabled()
      await expect(page.getByTestId('presentation-counter')).toContainText('1 / 1')
    })

    test('keyboard, SVG controls, boundaries and native button activation @core-interaction', async ({
      page
    }) => {
      await openPresentation(page, surface)
      const controls = presentationControls(page)
      const previous = controls.getByRole('button', { name: /^Previous/ })
      const next = controls.getByRole('button', { name: /^Next/ })
      await expect(previous).toBeDisabled()
      const order = await controls
        .locator('button')
        .evaluateAll((nodes) => nodes.map((node) => node.dataset.action))
      expect(order.slice(0, 5)).toEqual([
        'toggleOverview',
        'previous',
        'next',
        'togglePointer',
        'clearInk'
      ])
      expect(await controls.locator('button svg').count()).toBe(order.length)
      await next.focus()
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('presentation-counter')).toContainText('2 / 3')
      const position = await next.boundingBox()
      await page.keyboard.press('ArrowRight')
      await expect(page.getByTestId('presentation-counter')).toContainText('3 / 3')
      await expect(next).toBeDisabled()
      expect((await next.boundingBox())!.x).toBe(position!.x)
      await page.keyboard.press('o')
      await expect(next).toBeEnabled()
      await page.keyboard.press('Escape')
      await expect(controls.getByRole('button', { name: /^Overview/ })).toHaveAttribute(
        'aria-pressed',
        'false'
      )
      await expect(page.getByTestId('presentation-counter')).toContainText('3 / 3')
      await page.keyboard.press('Escape')
      await expect(controls).toHaveCount(surface === 'app' ? 0 : 1)
    })

    test('Korean IME letter shortcuts work with hidden controls and leave text input alone @core-interaction', async ({
      page
    }) => {
      await openPresentation(page, surface)
      const controls = presentationControls(page)
      await expect(controls).toBeHidden({ timeout: 6000 })
      const dispatch = (
        key: string,
        code: string,
        init: { keyCode?: number; isComposing?: boolean } = {}
      ) =>
        page.evaluate(
          ({ key, code, init }) => {
            const event = new KeyboardEvent('keydown', {
              key,
              code,
              bubbles: true,
              cancelable: true,
              ...init
            })
            document.body.dispatchEvent(event)
            return event.defaultPrevented
          },
          { key, code, init }
        )
      for (const init of [
        {},
        { keyCode: 229 },
        { isComposing: true },
        { keyCode: 229, isComposing: true }
      ]) {
        expect(await dispatch(init.keyCode ? 'Process' : 'ㅔ', 'KeyP', init)).toBe(true)
        await expect(page.getByTestId('pointer-toggle')).toHaveAttribute('aria-pressed', 'true')
        await dragOnCanvas(page, [300, 250], [500, 350])
        await expect(inkStrokes(page)).toHaveCount(1)
        expect(await dispatch('ㄷ', 'KeyE', init)).toBe(true)
        await expect(inkStrokes(page)).toHaveCount(0)
        expect(await dispatch('ㅐ', 'KeyO', init)).toBe(true)
        await expect(controls.locator('[data-action="toggleOverview"]')).toHaveAttribute(
          'aria-pressed',
          'true'
        )
        expect(await dispatch('ㅐ', 'KeyO', init)).toBe(true)
        expect(await dispatch('ㅔ', 'KeyP', init)).toBe(true)
        await expect(page.getByTestId('pointer-toggle')).toHaveAttribute('aria-pressed', 'false')
        await expect(controls).toBeHidden()
      }
      for (const code of ['Enter', 'Escape', 'Tab', 'ArrowRight']) {
        expect(await dispatch(code, code, { isComposing: true, keyCode: 229 })).toBe(false)
      }
      const inputResults = await page.evaluate(() => {
        const results: boolean[] = []
        for (const editable of ['input', 'textarea', 'div']) {
          const target = document.createElement(editable)
          if (editable === 'div') {
            target.contentEditable = 'true'
          }
          document.body.append(target)
          target.focus()
          for (const [key, code] of [
            ['ㅔ', 'KeyP'],
            ['ㄷ', 'KeyE'],
            ['ㅐ', 'KeyO']
          ] as const) {
            const event = new KeyboardEvent('keydown', {
              key,
              code,
              isComposing: true,
              keyCode: 229,
              bubbles: true,
              cancelable: true
            })
            target.dispatchEvent(event)
            results.push(event.defaultPrevented)
          }
          target.remove()
        }
        return results
      })
      expect(inputResults).toEqual(Array<boolean>(9).fill(false))
      await expect(page.getByTestId('pointer-toggle')).toHaveAttribute('aria-pressed', 'false')
      await expect(page.getByTestId('presentation-counter')).toContainText('1 / 3')
      await expect(controls).toBeHidden()
    })

    test('only the bottom edge or Tab reveals hidden controls; clicks and ink do not @core-interaction', async ({
      page
    }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await openPresentation(page, surface)
      const controls = presentationControls(page)
      await expect(controls).toHaveCSS('transition-duration', '0s')
      await expect(controls).toBeHidden({ timeout: 6000 })
      expect(
        await controls
          .locator('button')
          .first()
          .evaluate((button) => {
            button.focus()
            return document.activeElement === button
          })
      ).toBe(false)
      await page.mouse.click(200, 200)
      await expect(controls).toBeHidden()
      await page.keyboard.press('p')
      await dragOnCanvas(page, [250, 250], [400, 350])
      await expect(inkStrokes(page)).toHaveCount(1)
      await expect(controls).toBeHidden()
      await page.keyboard.press('p')
      await revealControls(page)
      await page.mouse.move(200, 200)
      await expect(controls).toBeHidden({ timeout: 6000 })
      await page.keyboard.press('Tab')
      await expect(controls).toBeVisible()
      await expect(controls.getByRole('button', { name: /^Overview/ })).toBeFocused()
      await controls.getByRole('button', { name: /^Next/ }).focus()
      await page.waitForTimeout(1700)
      await expect(controls).toBeVisible()
      await page.mouse.click(200, 200)
      await expect(controls).toBeHidden({ timeout: 6000 })
      for (const pointerType of ['touch', 'pen']) {
        await sendPointer(page, 'pointerdown', { pointerType, clientX: 200, clientY: 200 })
        await sendPointer(page, 'pointerup', { pointerType, clientX: 200, clientY: 200 })
        await expect(controls).toBeHidden()
      }
      const bottom = { pointerType: 'touch', clientX: 10, clientY: page.viewportSize()!.height - 4 }
      await sendPointer(page, 'pointerdown', bottom)
      await sendPointer(page, 'pointerup', bottom)
      await expect(controls).toBeVisible()
      await expect(page.getByTestId('presentation-counter')).toContainText('1 / 3')
    })

    test('drawing after clicking the pointer releases toolbar focus on desktop and compact screens @core-interaction', async ({
      page
    }) => {
      await openPresentation(page, surface)
      for (const width of [1400, 320]) {
        await page.setViewportSize({ width, height: 800 })
        await revealControls(page)
        if (width === 320) {
          await page.getByTestId('presentation-tools').click()
        }
        await page.getByTestId('pointer-toggle').click()
        await dragOnCanvas(page, [80, 220], [210, 320])
        await expect(inkStrokes(page)).toHaveCount(1)
        await expect(presentationControls(page)).toBeHidden({ timeout: 6000 })
        await page.keyboard.press('e')
        await expect(inkStrokes(page)).toHaveCount(0)
        await page.keyboard.press('p')
      }
    })

    test('compact tools remain reachable at 320px and Escape closes tools before overview @core-interaction', async ({
      page
    }) => {
      await openPresentation(page, surface)
      for (const width of [721, 720, 480, 320]) {
        await page.setViewportSize({ width, height: 800 })
        await revealControls(page)
        const box = (await presentationControls(page).boundingBox())!
        expect(box.height).toBe(36)
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(width)
        for (const button of await presentationControls(page).getByRole('button').all()) {
          const rect = (await button.boundingBox())!
          const targetSize = width <= 720 ? 44 : 28
          expect(rect.width).toBeCloseTo(targetSize, 2)
          expect(rect.height).toBeCloseTo(targetSize, 2)
        }
        await page.keyboard.press('Tab')
        const overview = presentationControls(page).getByRole('button', { name: /^Overview/ })
        await overview.focus()
        const ring = await overview.evaluate((button) => {
          const rect = button.getBoundingClientRect()
          const style = getComputedStyle(button)
          const outside =
            Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset)
          return {
            visible: button.matches(':focus-visible'),
            top: rect.top - outside,
            bottom: rect.bottom + outside
          }
        })
        expect(ring.visible).toBe(true)
        expect(ring.top).toBeGreaterThanOrEqual(box.y)
        expect(ring.bottom).toBeLessThanOrEqual(box.y + box.height)
      }
      await page.keyboard.press('o')
      await page.getByTestId('presentation-tools').click()
      await expect(page.getByTestId('pointer-toggle')).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('pointer-toggle')).toHaveAttribute('aria-pressed', 'true')
      await page.keyboard.press('ArrowDown')
      await expect(page.getByTestId('ink-clear')).toBeFocused()
      await page.waitForTimeout(1700)
      await expect(presentationControls(page)).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('presentation-tools')).toBeFocused()
      await expect(page.getByTestId('pointer-toggle')).toBeHidden()
      await expect(
        presentationControls(page).getByRole('button', { name: /^Overview/ })
      ).toHaveAttribute('aria-pressed', 'true')
      await page.keyboard.press('Escape')
      await expect(
        presentationControls(page).getByRole('button', { name: /^Overview/ })
      ).toHaveAttribute('aria-pressed', 'false')
      await expect(inkStrokes(page)).toHaveCount(0)
    })

    test('laser, retained ink, overview and frame clearing @core-interaction', async ({ page }) => {
      await openPresentation(page, surface)
      const serialized =
        surface === 'html' ? await page.locator('#canvas-document').textContent() : null
      await page.keyboard.press('p')
      await page.mouse.move(320, 240)
      await expect(page.getByTestId('laser-pointer')).toHaveCSS('transition-duration', '0s')
      await page.mouse.click(320, 240)
      await expect(inkStrokes(page)).toHaveCount(0)
      await dragOnCanvas(page, [320, 240], [600, 390])
      await expect(inkStrokes(page)).toHaveCount(1)
      const path = await inkStrokes(page).first().getAttribute('d')
      await page.keyboard.press('p')
      await expect(page.getByTestId('laser-pointer')).toHaveCount(0)
      await page.waitForTimeout(1700)
      await expect(inkStrokes(page).first()).toHaveAttribute('d', path!)
      await page.keyboard.press('o')
      await page.keyboard.press('Escape')
      await expect(inkStrokes(page)).toHaveCount(1)
      await page.keyboard.press('p')
      await page.keyboard.press('o')
      const sameFrame =
        surface === 'app'
          ? page.getByTestId('overview-frame').first()
          : page.locator('[data-frame-index="0"]')
      await sameFrame.click()
      await expect(inkStrokes(page)).toHaveCount(1)
      await page.keyboard.press('p')
      await page.keyboard.press('ArrowRight')
      await expect(inkStrokes(page)).toHaveCount(0)
      await page.keyboard.press('p')
      await dragOnCanvas(page, [320, 240], [600, 390])
      await page.keyboard.press('e')
      await expect(inkStrokes(page)).toHaveCount(0)
      if (surface === 'html') {
        expect(await page.locator('#canvas-document').textContent()).toBe(serialized)
      }
    })

    test('release endpoints, cancellation, secondary pointers, blur and lost release @core-interaction', async ({
      page
    }) => {
      await openPresentation(page, surface)
      await page.keyboard.press('p')
      await sendPointer(page, 'pointerdown', {})
      await sendPointer(page, 'pointerup', { clientX: 450 })
      await expect(inkStrokes(page)).toHaveCount(1)
      const endpoints = await inkEndpoints(page)
      expect(endpoints.start.x).toBeCloseTo(350, 0)
      expect(endpoints.end.x).toBeCloseTo(450, 0)
      for (const cancel of ['pointercancel', 'blur', 'secondary', 'lost']) {
        await page.keyboard.press('e')
        await sendPointer(page, 'pointerdown', {})
        await sendPointer(page, 'pointermove', { clientX: 400 })
        const path = await inkStrokes(page).first().getAttribute('d')
        if (cancel === 'blur') {
          await page.evaluate(() => window.dispatchEvent(new Event('blur')))
        } else if (cancel === 'secondary') {
          await sendPointer(page, 'pointerdown', { pointerId: 20, isPrimary: false })
        } else {
          await sendPointer(page, cancel === 'lost' ? 'pointermove' : 'pointercancel', {
            buttons: 0,
            clientX: 800
          })
        }
        await sendPointer(page, 'pointermove', { clientX: 900 })
        await sendPointer(page, 'pointerup', { clientX: 950 })
        await expect(inkStrokes(page).first()).toHaveAttribute('d', path!)
      }
    })

    test('touch and pen drawing never also swipe; content and controls own their inputs @core-interaction', async ({
      page
    }) => {
      await openPresentation(page, surface)
      for (const pointerType of ['touch', 'pen']) {
        await page.keyboard.press('p')
        await sendPointer(page, 'pointerdown', { pointerType, clientX: 600 })
        await sendPointer(page, 'pointermove', { pointerType, clientX: 450 })
        await sendPointer(page, 'pointerup', { pointerType, clientX: 300 })
        await expect(page.getByTestId('presentation-counter')).toContainText('1 / 3')
        await expect(inkStrokes(page)).toHaveCount(1)
        await page.keyboard.press('p')
        await sendPointer(page, 'pointerdown', { pointerType, clientX: 600 })
        await sendPointer(page, 'pointerup', { pointerType, clientX: 300 })
        await expect(page.getByTestId('presentation-counter')).toContainText('2 / 3')
        await page.keyboard.press('ArrowLeft')
      }
      await page.keyboard.press('p')
      await revealControls(page)
      await presentationControls(page).getByRole('button', { name: /^Next/ }).click()
      await expect(inkStrokes(page)).toHaveCount(0)
      await page.keyboard.press('o')
      const frames =
        surface === 'app'
          ? page.getByTestId('overview-frame')
          : page.locator('.uc-overview .uc-frame')
      await frames.first().click()
      await expect(inkStrokes(page)).toHaveCount(0)
      await page.evaluate(() => {
        const viewport = document.querySelector('[data-testid="canvas-viewport"]')!
        const content = document.createElement('div')
        content.innerHTML =
          '<input aria-label="Audience input"><video controls></video><a href="#content">Link</a>'
        Object.assign(content.style, {
          position: 'absolute',
          top: '10px',
          left: '10px',
          zIndex: '50'
        })
        viewport.append(content)
      })
      await page.getByRole('textbox', { name: 'Audience input' }).fill('p e o')
      await page.keyboard.press('ArrowRight')
      await expect(page.getByTestId('presentation-counter')).toContainText('1 / 3')
      for (const selector of ['input', 'video', 'a[href="#content"]']) {
        await page
          .locator(selector)
          .dispatchEvent('pointerdown', { pointerId: 19, isPrimary: true, button: 0, buttons: 1 })
        await sendPointer(page, 'pointerup', { clientX: 700 })
      }
      await expect(inkStrokes(page)).toHaveCount(0)
    })

    test('world ink follows pan, zoom, roll, resize and the existing flight @core-interaction', async ({
      page
    }) => {
      await openPresentation(page, surface, { roll: 30, transitionMs: 500 })
      await page.waitForTimeout(350)
      await page.keyboard.press('p')
      await sendPointer(page, 'pointerdown', { clientX: 300, clientY: 250 })
      await sendPointer(page, 'pointerup', { clientX: 600, clientY: 350 })
      let endpoints = await inkEndpoints(page)
      expect(endpoints.start.x).toBeCloseTo(300, 0)
      expect(endpoints.start.y).toBeCloseTo(250, 0)
      expect(endpoints.end.x).toBeCloseTo(600, 0)
      const transform = await page
        .getByTestId('presentation-ink')
        .locator('g')
        .getAttribute('transform')
      await page.keyboard.press('o')
      await expect
        .poll(() => page.getByTestId('presentation-ink').locator('g').getAttribute('transform'))
        .not.toBe(transform)
      await page.waitForTimeout(650)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(650)
      endpoints = await inkEndpoints(page)
      expect(endpoints.start.x).toBeCloseTo(300, 0)
      expect(endpoints.end.y).toBeCloseTo(350, 0)
      await page.setViewportSize({ width: 1100, height: 700 })
      await page.waitForTimeout(650)
      await page.keyboard.press('e')
      await sendPointer(page, 'pointerdown', { clientX: 200, clientY: 250 })
      await sendPointer(page, 'pointerup', { clientX: 500, clientY: 350 })
      endpoints = await inkEndpoints(page)
      expect(endpoints.start.x).toBeCloseTo(200, 0)
      expect(endpoints.end.y).toBeCloseTo(350, 0)
    })

    test('maximum zoom never paints a click cap or scales the ink nib @core-interaction', async ({
      page
    }) => {
      await openPresentation(page, surface, { tiny: true, count: 1 })
      await expect(page.getByTestId('presentation-ink').locator('g')).toHaveAttribute(
        'transform',
        /scale\(64\)/
      )
      await page.keyboard.press('p')
      await page.mouse.click(500, 400)
      await expect(inkStrokes(page)).toHaveCount(0)
      await dragOnCanvas(page, [700, 400], [760, 430])
      const box = (await inkStrokes(page).first().boundingBox())!
      expect(box.width).toBeLessThan(80)
      expect(box.height).toBeLessThan(50)
      await expect(inkStrokes(page).first()).toHaveAttribute('vector-effect', 'non-scaling-stroke')
      await revealControls(page)
      await expect(presentationControls(page).getByRole('button', { name: /^Next/ })).toBeDisabled()
    })
  })
}

test('HTML stays English, light and self-contained offline; an empty board has no invalid counter @core-interaction', async ({
  page,
  browserName
}) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await openPresentation(page, 'html')
  const requests: string[] = []
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) {
      requests.push(request.url())
    }
  })
  // WebKit's offline emulation rejects file:// reloads internally; deny HTTP(S) at the transport instead.
  await page.route(/^https?:/, (route) => route.abort())
  if (browserName !== 'webkit') {
    await page.context().setOffline(true)
  }
  await page.reload()
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(247, 247, 248)')
  await expect(presentationControls(page)).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(presentationControls(page).getByRole('button', { name: /^Exit/ })).toHaveCount(0)
  await page.keyboard.press('p')
  await dragOnCanvas(page, [300, 250], [500, 350])
  await expect(inkStrokes(page)).toHaveCount(1)
  expect(requests).toEqual([])
  await page.context().setOffline(false)
  await page.unroute(/^https?:/)
  await openPresentation(page, 'html', { count: 0 })
  await expect(page.getByTestId('presentation-counter')).toHaveCount(0)
  await expect(page.getByText('This board has no presentation frames.')).toBeVisible()
})

test('app dark appearance and a restarted presentation retain their host behavior @core-interaction', async ({
  page
}) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await openPresentation(page, 'app')
  await expect(presentationControls(page)).toHaveCSS('background-color', 'rgb(31, 31, 35)')
  await page.keyboard.press('p')
  await dragOnCanvas(page, [300, 250], [500, 350])
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Slide Show', exact: true }).click()
  await expect(inkStrokes(page)).toHaveCount(0)
  await expect(page.getByTestId('pointer-toggle')).toHaveAttribute('aria-pressed', 'false')
})

test('changing app language updates labels without restarting the presentation or losing ink @core-interaction', async ({
  page
}) => {
  await openPresentation(page, 'app')
  await page.keyboard.press('p')
  await dragOnCanvas(page, [300, 250], [500, 350])
  const path = await inkStrokes(page).first().getAttribute('d')
  await expect(presentationControls(page)).toBeHidden({ timeout: 6000 })
  await page.evaluate(async (url) => {
    const { useLanguageStore } = await import(url)
    useLanguageStore.getState().setPreference('ko')
  }, appModuleUrl('store/language-store.ts'))
  await expect(page.getByTestId('pointer-toggle')).toHaveAttribute('aria-label', /포인터/)
  await expect(page.getByTestId('pointer-toggle')).toHaveAttribute('aria-pressed', 'true')
  await expect(inkStrokes(page).first()).toHaveAttribute('d', path!)
  await expect(presentationControls(page)).toBeHidden()
  await page.keyboard.press('e')
  await expect(inkStrokes(page)).toHaveCount(0)
})

test('replacing a document with the same frame IDs starts a fresh annotation session @core-interaction', async ({
  page
}) => {
  await openPresentation(page, 'app')
  await page.keyboard.press('p')
  await dragOnCanvas(page, [300, 250], [500, 350])
  await expect(inkStrokes(page)).toHaveCount(1)
  await page.evaluate(async (url) => {
    const { useDocumentStore } = await import(url)
    const document = structuredClone(useDocumentStore.getState().document)
    document.name = 'Replacement document'
    useDocumentStore.getState().loadDocument(document, null)
  }, appModuleUrl('store/document-store.ts'))
  await expect(inkStrokes(page)).toHaveCount(0)
  await expect(page.getByTestId('pointer-toggle')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('presentation-counter')).toContainText('1 / 3')
})

test('exporting a drawn presentation packages the tool without session strokes @core-interaction', async ({
  page
}) => {
  await openPresentation(page, 'app')
  await page.keyboard.press('p')
  await dragOnCanvas(page, [300, 250], [500, 350])
  await expect(inkStrokes(page)).toHaveCount(1)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  await page.getByRole('button', { name: 'Export HTML', exact: true }).click()
  const url = await downloadPresentation(page)
  const viewer = await page.context().newPage()
  await viewer.goto(url)
  await expect(inkStrokes(viewer)).toHaveCount(0)
  await expect(viewer.getByTestId('pointer-toggle')).toHaveAttribute('aria-pressed', 'false')
  await viewer.keyboard.press('p')
  await dragOnCanvas(viewer, [300, 250], [500, 350])
  await expect(inkStrokes(viewer)).toHaveCount(1)
})

test.describe('real touchscreen presentation input', () => {
  test.use({ hasTouch: true })
  for (const surface of ['app', 'html'] as const) {
    test(`${surface} draws without a swipe and tools stay usable by touch`, async ({
      page,
      browserName
    }) => {
      test.skip(
        browserName !== 'chromium',
        'CDP touch injection is Chromium-specific; all engines run the pointer contract.'
      )
      await openPresentation(page, surface)
      await page.setViewportSize({ width: 390, height: 844 })
      const cdp = await page.context().newCDPSession(page)
      const tools = page.getByTestId('presentation-tools')
      await tools.tap()
      await expect(tools).toHaveAttribute('aria-expanded', 'true')
      await page.getByTestId('pointer-toggle').tap()
      await expect(page.getByTestId('pointer-toggle')).toHaveAttribute('aria-pressed', 'true')
      await tools.tap()
      await expect(tools).toHaveAttribute('aria-expanded', 'false')
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: 300, y: 350 }]
      })
      for (const x of [260, 200, 140, 80]) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: 350 }]
        })
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await expect(inkStrokes(page)).toHaveCount(1)
      await expect(page.getByTestId('presentation-counter')).toContainText('1 / 3')
      await tools.tap()
      await expect(tools).toHaveAttribute('aria-expanded', 'true')
      await page.getByTestId('ink-clear').tap()
      await expect(inkStrokes(page)).toHaveCount(0)
    })
  }
})

test('cloud slideshow uses the same annotations without an editor exit @core-interaction', async ({
  page
}) => {
  await page.route('**/api/share/*', (route) =>
    route.fulfill({
      json: {
        access: 'present',
        document: {
          version: 1,
          name: 'Shared annotations',
          elements: {
            f1: {
              id: 'f1',
              type: 'frame',
              name: 'First',
              order: 0,
              x: 0,
              y: 0,
              width: 1200,
              height: 800
            },
            f2: {
              id: 'f2',
              type: 'frame',
              name: 'Second',
              order: 1,
              x: 2000,
              y: 0,
              width: 1200,
              height: 800
            }
          },
          order: ['f1', 'f2'],
          settings: {
            transitionMs: 0,
            transitionEasing: 'smooth',
            transitionArc: 1.414,
            spotlight: 0,
            background: 'dots',
            frameBorder: 'solid'
          },
          assets: {}
        }
      }
    })
  )
  await page.goto('/?share=abcdefghijklmnopqr_-1')
  await expect(page.getByTestId('shared-slide-show')).toBeVisible()
  await expect(presentationControls(page).getByRole('button', { name: /^Exit/ })).toHaveCount(0)
  await page.keyboard.press('p')
  await dragOnCanvas(page, [300, 250], [500, 350])
  await expect(inkStrokes(page)).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(inkStrokes(page)).toHaveCount(1)
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('presentation-counter')).toContainText('2 / 2')
  await expect(inkStrokes(page)).toHaveCount(0)
})
