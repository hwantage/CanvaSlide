import { expect, test, type Page } from '@playwright/test'
import { primaryModifier } from './canvas-gestures'

const IDLE_MS = 1500
/** The idle wait plus the slide-out, with room for a loaded machine. */
const HIDE_TIMEOUT = IDLE_MS + 4000

const controls = (page: Page) => page.getByTestId('presentation-controls')

async function startSlideShow(page: Page) {
  const frames = [1, 2, 3].map((number) => ({
    id: `f${number}`,
    type: 'frame',
    name: `Shot ${number}`,
    order: number,
    x: (number - 1) * 2000,
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
    name: 'auto-hide.canvaslide',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        name: 'Auto hide',
        elements: Object.fromEntries(frames.map((frame) => [frame.id, frame])),
        order: frames.map((frame) => frame.id),
        settings: { transitionMs: 200 },
        assets: {},
        resources: {},
        camera: { x: 0, y: 0, zoom: 1 }
      })
    )
  })
  await expect(page.getByTestId('frame-row')).toHaveCount(3)
  await page.keyboard.press(`${await primaryModifier(page)}+Enter`)
  await expect(page.getByTestId('presentation-counter')).toContainText('1 / 3')
}

test('the control bar leaves once the pointer rests and the bottom edge brings it back', async ({
  page
}) => {
  test.setTimeout(60_000)
  await startSlideShow(page)
  await expect(controls(page)).toBeVisible()

  await expect(controls(page)).toBeHidden({ timeout: HIDE_TIMEOUT })
  // Hidden means gone from the tab order and the accessibility tree, not merely transparent.
  const exit = controls(page).locator('button[aria-label^="Exit"]')
  await expect(exit).toBeHidden()
  expect(
    await exit.evaluate((button) => {
      button.focus()
      return document.activeElement === button
    })
  ).toBe(false)
  await expect(controls(page).getByRole('button', { name: /^Exit/ })).toHaveCount(0)
  // Tab is the keyboard's way back to a bar it can no longer reach.
  await page.keyboard.press('Tab')
  await expect(controls(page)).toBeVisible()
  await expect(controls(page).getByRole('button', { name: /^Overview/ })).toBeFocused()
  await page.mouse.click(200, 200)
  await expect(controls(page)).toBeHidden({ timeout: HIDE_TIMEOUT })

  const { width, height } = page.viewportSize()!
  // Moving over the slide is pointing, not asking for the controls, and neither is drifting low.
  await page.mouse.move(width / 2, height / 2)
  await expect(controls(page)).toBeHidden()
  await page.mouse.move(width / 2, height - 100)
  await expect(controls(page)).toBeHidden()

  await page.mouse.move(width / 2, height - 20)
  await expect(controls(page)).toBeVisible()
  // Every reveal restarts the idle wait, so the bar sees itself out again.
  await expect(controls(page)).toBeHidden({ timeout: HIDE_TIMEOUT })
})

test('reduced motion swaps the slide for a plain show and hide', async ({ page }) => {
  test.setTimeout(60_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await startSlideShow(page)
  await expect(controls(page)).toHaveCSS('transition-duration', '0s')
  await expect(controls(page)).toBeHidden({ timeout: HIDE_TIMEOUT })
  const { width, height } = page.viewportSize()!
  await page.mouse.move(width / 2, height - 20)
  await expect(controls(page)).toBeVisible()
})

test('the control bar stays up under the pointer and under the keyboard', async ({ page }) => {
  test.setTimeout(60_000)
  await startSlideShow(page)
  const box = await controls(page).boundingBox()
  if (!box) {
    throw new Error('presentation controls not laid out')
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(IDLE_MS + 1000)
  await expect(controls(page)).toBeVisible()

  // Focus inside the bar holds it open even after the pointer has left.
  await controls(page).getByRole('button', { name: /^Next/ }).focus()
  await page.mouse.move(box.x + box.width / 2, 10)
  await page.waitForTimeout(IDLE_MS + 1000)
  await expect(controls(page)).toBeVisible()
  await expect(controls(page).getByRole('button', { name: /^Next/ })).toBeFocused()
})
