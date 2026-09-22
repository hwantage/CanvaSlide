import { mkdtempSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test, type CDPSession, type Page } from '@playwright/test'
import { createEmptyDocument, type CanvasDocument } from '../../src/shared/canvas/element-types'
import { buildStandaloneHtml } from '../../src/shared/canvas/html-export'
import { primaryModifier } from './canvas-gestures'

const PHONE = { width: 390, height: 844 }
const MID_Y = 380
const shareId = 'abcdefghijklmnopqr_-1'

function deck(): CanvasDocument {
  const document = createEmptyDocument()
  document.name = 'Swipe deck'
  document.settings.transitionMs = 0
  for (let index = 0; index < 3; index++) {
    const id = `frame-${index}`
    document.elements[id] = {
      id,
      type: 'frame',
      name: `Scene ${index + 1}`,
      order: index,
      x: index * 1600,
      y: 0,
      width: 1280,
      height: 720
    }
    document.order.push(id)
  }
  return document
}

type Point = [number, number]
type TouchPhase = 'touchStart' | 'touchMove' | 'touchEnd'

async function touch(cdp: CDPSession, type: TouchPhase, points: Point[]): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map(([x, y]) => ({ x, y }))
  })
}

/** A flick: short, horizontal and quick enough to clear presentationSwipeAction's thresholds. */
async function swipe(cdp: CDPSession, from: Point, to: Point): Promise<void> {
  await touch(cdp, 'touchStart', [from])
  for (const step of [0.35, 0.7, 1]) {
    await touch(cdp, 'touchMove', [
      [from[0] + (to[0] - from[0]) * step, from[1] + (to[1] - from[1]) * step]
    ])
  }
  await touch(cdp, 'touchEnd', [])
}

const counterOf = (page: Page) => page.getByTestId('presentation-counter')

/** The same gesture contract on every surface: the export must not drift from the app. */
async function assertSwipeContract(page: Page, cdp: CDPSession) {
  const counter = counterOf(page)
  await expect(counter).toContainText('1 / 3')

  await swipe(cdp, [300, MID_Y], [80, MID_Y])
  await expect(counter).toContainText('2 / 3')
  await swipe(cdp, [80, MID_Y], [300, MID_Y])
  await expect(counter).toContainText('1 / 3')

  // A tap belongs to the slide, so content interactions never advance the deck.
  await page.touchscreen.tap(20, MID_Y)
  await page.touchscreen.tap(PHONE.width - 20, MID_Y)
  await page.touchscreen.tap(PHONE.width / 2, MID_Y)
  await expect(counter).toContainText('1 / 3')

  // A gesture the reader is still shaping: past the flick window, so it is not navigation.
  await touch(cdp, 'touchStart', [[300, MID_Y]])
  await touch(cdp, 'touchMove', [[190, MID_Y]])
  await page.waitForTimeout(700)
  await touch(cdp, 'touchMove', [[80, MID_Y]])
  await touch(cdp, 'touchEnd', [])
  await expect(counter).toContainText('1 / 3')

  // Vertical travel is not a horizontal flick.
  await swipe(cdp, [200, 200], [180, 600])
  await expect(counter).toContainText('1 / 3')

  // Two fingers are a pinch, never a page turn.
  await touch(cdp, 'touchStart', [[300, MID_Y]])
  await touch(cdp, 'touchStart', [
    [300, MID_Y],
    [320, 520]
  ])
  await touch(cdp, 'touchMove', [
    [80, MID_Y],
    [100, 520]
  ])
  await touch(cdp, 'touchEnd', [])
  await expect(counter).toContainText('1 / 3')

  // Mouse input is unchanged: no drag of the same shape steps the deck.
  await page.mouse.move(300, MID_Y)
  await page.mouse.down()
  await page.mouse.move(80, MID_Y, { steps: 4 })
  await page.mouse.up()
  await expect(counter).toContainText('1 / 3')
  await page.keyboard.press('ArrowRight')
  await expect(counter).toContainText('2 / 3')
}

test.describe('presentation swipe navigation', () => {
  test.use({ viewport: PHONE, hasTouch: true })

  test('the exported player steps on a flick and leaves every other gesture alone', async ({
    page
  }) => {
    const playerScript = await readFile(
      resolve(import.meta.dirname, '../../src/renderer/src/generated/player.iife.js'),
      'utf8'
    )
    const file = join(mkdtempSync(join(tmpdir(), 'uc-swipe-')), 'deck.html')
    await writeFile(file, buildStandaloneHtml({ document: deck(), playerScript }), 'utf8')
    await page.goto(pathToFileURL(file).href)

    const cdp = await page.context().newCDPSession(page)
    await assertSwipeContract(page, cdp)

    // The nav bar keeps its own taps, and a flick that starts on it is the bar's.
    const nav = page.getByRole('button', { name: 'Next frame (→)' })
    const box = (await nav.boundingBox())!
    const onBar: Point = [box.x + box.width / 2, box.y + box.height / 2]
    await page.touchscreen.tap(...onBar)
    await expect(counterOf(page)).toContainText('3 / 3')
    await swipe(cdp, onBar, [40, onBar[1]])
    await expect(counterOf(page)).toContainText('3 / 3')

    // The overview maps taps to frames; a flick must not steal them.
    await page.getByRole('button', { name: 'Overview (O)' }).tap()
    await expect(page.locator('.uc-overview')).toHaveCount(1)
    await swipe(cdp, [300, MID_Y], [80, MID_Y])
    await expect(page.locator('.uc-overview')).toHaveCount(1)
    const frame = page.locator('.uc-frame').first()
    const frameBox = (await frame.boundingBox())!
    await page.touchscreen.tap(frameBox.x + frameBox.width / 2, frameBox.y + frameBox.height / 2)
    await expect(counterOf(page)).toContainText('1 / 3')
    await expect(page.locator('.uc-overview')).toHaveCount(0)
  })

  test('the editor slide show honours the same gesture contract', async ({ page }) => {
    await page.route('**/api/share/*', (route) =>
      route.fulfill({ json: { access: 'edit', document: deck() } })
    )
    await page.goto(`/?share=${shareId}`)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.keyboard.press(`${await primaryModifier(page)}+Enter`)
    await expect(page.getByTestId('presentation-controls')).toBeVisible()

    const cdp = await page.context().newCDPSession(page)
    await assertSwipeContract(page, cdp)

    // The overview picker owns its taps here too.
    await page.getByRole('button', { name: /Overview/ }).tap()
    await swipe(cdp, [300, MID_Y], [80, MID_Y])
    await expect(page.getByTestId('overview-frame')).toHaveCount(3)
    await page.getByTestId('overview-frame').last().tap()
    await expect(counterOf(page)).toContainText('3 / 3')
  })

  test('the shared slide show honours the same gesture contract', async ({ page }) => {
    await page.route('**/api/share/*', (route) =>
      route.fulfill({ json: { access: 'present', document: deck() } })
    )
    await page.goto(`/?share=${shareId}`)
    await expect(page.getByTestId('shared-slide-show')).toBeVisible()

    const cdp = await page.context().newCDPSession(page)
    await assertSwipeContract(page, cdp)
  })

  test('swipes do nothing outside a slide show', async ({ page }) => {
    await page.route('**/api/share/*', (route) =>
      route.fulfill({ json: { access: 'edit', document: deck() } })
    )
    await page.goto(`/?share=${shareId}`)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const cdp = await page.context().newCDPSession(page)
    const before = await page.getByTestId('world-layer').evaluate((el) => el.style.transform)
    await swipe(cdp, [300, MID_Y], [80, MID_Y])
    await expect(page.getByTestId('presentation-controls')).toHaveCount(0)
    expect(await page.getByTestId('world-layer').evaluate((el) => el.style.transform)).toBe(before)
  })
})
