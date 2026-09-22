import { mkdtempSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test, type CDPSession, type Locator, type Page } from '@playwright/test'
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
  // Why: releasing while still moving reads as a fling, and Chromium spends the next tap stopping
  // it. Settling first keeps the gesture a flick — still far inside SWIPE_MAX_DURATION_MS.
  await touch(cdp, 'touchMove', [to])
  await touch(cdp, 'touchEnd', [])
}

/**
 * Why: every touch here goes through this one CDP session. Mixing it with Playwright's own
 * touchscreen leaves a tap that follows a swipe unhandled on Linux, which would quietly turn the
 * "a tap does nothing" assertions into assertions about a lost event.
 */
async function tap(cdp: CDPSession, at: Point): Promise<void> {
  await touch(cdp, 'touchStart', [at])
  await touch(cdp, 'touchEnd', [])
}

async function tapCentre(cdp: CDPSession, locator: Locator): Promise<void> {
  await locator.waitFor({ state: 'visible' })
  const box = (await locator.boundingBox())!
  await tap(cdp, [box.x + box.width / 2, box.y + box.height / 2])
}

const counterOf = (page: Page) => page.getByTestId('presentation-counter')

/** The same gesture contract on every surface: the export must not drift from the app. */
async function assertSwipeContract(page: Page, cdp: CDPSession) {
  const counter = counterOf(page)
  const next = page.getByRole('button', { name: /Next frame/ })
  const previous = page.getByRole('button', { name: /Previous frame/ })
  await expect(counter).toContainText('1 / 3')

  // Taps come before any flick: Chromium spends a tap that follows one, which would leave these
  // asserting a lost event rather than the behaviour. A tap belongs to the slide, never the deck.
  await tap(cdp, [20, MID_Y])
  await tap(cdp, [PHONE.width - 20, MID_Y])
  await tap(cdp, [PHONE.width / 2, MID_Y])
  await expect(counter).toContainText('1 / 3')

  // Control for the three above: taps are landing, and the nav bar still owns its own.
  await tapCentre(cdp, next)
  await expect(counter).toContainText('2 / 3')
  await tapCentre(cdp, previous)
  await expect(counter).toContainText('1 / 3')

  await swipe(cdp, [300, MID_Y], [80, MID_Y])
  await expect(counter).toContainText('2 / 3')
  await swipe(cdp, [80, MID_Y], [300, MID_Y])
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

/**
 * The overview keeps tap-to-select, and a flick there must not steal it. The two are separate
 * sequences, each opened from the keyboard, so that no tap ever follows a flick.
 */
async function assertOverviewContract(page: Page, cdp: CDPSession, frames: Locator, open: Locator) {
  const counter = counterOf(page)
  await page.keyboard.press('o')
  await expect(open).toHaveCount(1)
  await tapCentre(cdp, frames.last())
  await expect(counter).toContainText('3 / 3')
  await expect(open).toHaveCount(0)

  await page.keyboard.press('o')
  await expect(open).toHaveCount(1)
  await swipe(cdp, [300, MID_Y], [80, MID_Y])
  await expect(counter).toContainText('3 / 3')
  await expect(open).toHaveCount(1)
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

    // A flick that starts on the nav bar is the bar's, not the deck's.
    const box = (await page.getByRole('button', { name: /Next frame/ }).boundingBox())!
    await swipe(cdp, [box.x + box.width / 2, box.y + box.height / 2], [40, box.y + box.height / 2])
    await expect(counterOf(page)).toContainText('2 / 3')

    await assertOverviewContract(page, cdp, page.locator('.uc-frame'), page.locator('.uc-overview'))
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

    await assertOverviewContract(
      page,
      cdp,
      page.getByTestId('overview-frame'),
      page.getByTestId('overview-frame').first()
    )
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
