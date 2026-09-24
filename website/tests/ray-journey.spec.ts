import { expect, test, type Page } from '@playwright/test'

async function center(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox()
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
}

async function scrollToPart(page: Page, selector: string, fraction: number) {
  await page.locator(selector).evaluate(
    (element, part) =>
      window.scrollTo({
        top:
          element.getBoundingClientRect().top +
          window.scrollY +
          element.clientHeight * part -
          window.innerHeight * 0.5,
        behavior: 'instant'
      }),
    fraction
  )
}

test('the mascot sweeps across pairs of sections and docks at the bottom center', async ({
  page
}) => {
  await page.goto('./')
  await expect(page.locator('.home-page')).toHaveAttribute('data-ray-ready', 'true')
  await page.getByRole('button', { name: 'Pause mascot animation', exact: true }).click()
  const origin = await center(page, '.hero-ray')
  await expect
    .poll(async () => Math.abs((await center(page, '.ray-flight')).x - origin.x))
    .toBeLessThan(3)
  for (const [selector, fraction, right] of [
    ['#possibilities', 0.6, true],
    ['#sharing', 0.6, false],
    ['#details', 0.5, false],
    ['#overview', 0.55, true],
    ['#story', 0.17, true],
    ['.features-section', 0.55, false]
  ] as const) {
    await scrollToPart(page, selector, fraction)
    await expect(page.locator('.ray-flight')).toHaveAttribute('data-stage', 'swimming')
    await expect
      .poll(async () => (await center(page, '.ray-flight')).x > page.viewportSize()!.width / 2)
      .toBe(right)
    await expect
      .poll(() =>
        page.locator('.ray-flight').evaluate((el) => Number(getComputedStyle(el).opacity))
      )
      .toBeLessThan(0.3)
  }
  await page.evaluate(() =>
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })
  )
  // Why: the pose eases at most 64ms of simulated time per frame, and CI's software GL renders
  // frames slowly, so settling within 0.5px of the dock can take well over the default 7s.
  await expect(page.locator('.ray-flight')).toHaveAttribute('data-stage', 'docked', {
    timeout: 25_000
  })
  const dock = await center(page, '.ray-dock img')
  const landed = await center(page, '.ray-flight')
  expect(Math.abs(landed.x - dock.x)).toBeLessThan(3)
  expect(Math.abs(landed.y - dock.y)).toBeLessThan(4)
  expect(landed.x).toBeCloseTo(page.viewportSize()!.width / 2, 0)
  await page.getByRole('link', { name: 'Back to top' }).click()
  await expect(page.locator('.ray-flight')).toHaveAttribute('data-stage', 'hero')
})

test('a fast page jump eases into place even while wing motion is paused', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.home-page')).toHaveAttribute('data-ray-ready', 'true')
  await page.getByRole('button', { name: 'Pause mascot animation', exact: true }).click()
  const movement = await page.evaluate(async () => {
    const flight = document.querySelector<HTMLElement>('.ray-flight')!
    const position = () => {
      const box = flight.getBoundingClientRect()
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    }
    const before = position()
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })
    for (let frame = 0; frame < 4; frame++) {
      await new Promise(requestAnimationFrame)
    }
    const after = position()
    const dock = document.querySelector('.ray-dock img')!.getBoundingClientRect()
    return {
      traveled: Math.hypot(after.x - before.x, after.y - before.y),
      total: Math.hypot(dock.x + dock.width / 2 - before.x, dock.y + dock.height / 2 - before.y)
    }
  })
  expect(movement.traveled).toBeGreaterThan(1)
  expect(movement.traveled).toBeLessThan(movement.total * 0.5)
  await expect(page.locator('.ray-flight')).toHaveAttribute('data-stage', 'docked')
  await expect
    .poll(async () => (await center(page, '.ray-flight')).x)
    .toBeCloseTo(page.viewportSize()!.width / 2, 0)
})

test('wing motion pauses, resumes, and remembers the preference', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.ray-flight')).toHaveAttribute('data-renderer', 'webgl')
  await page.getByRole('button', { name: 'Pause mascot animation', exact: true }).click()
  await expect(page.locator('.ray-flight')).toHaveAttribute('data-motion', 'still')
  // Why: page content above the transparent canvas adds compositing noise unrelated to the wings.
  const wings = () =>
    page
      .locator('.ray-flight canvas')
      .screenshot({ style: '.home-page > :not(.ray-layer) { visibility: hidden }' })
  const first = await wings()
  expect(await wings()).toEqual(first)
  await page.getByRole('button', { name: 'Resume mascot animation', exact: true }).click()
  await expect(page.locator('.ray-flight')).toHaveAttribute('data-motion', 'running')
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        let frames = 50
        const tick = () => {
          if (--frames === 0) {
            done()
          } else {
            requestAnimationFrame(tick)
          }
        }
        requestAnimationFrame(tick)
      })
  )
  await page.getByRole('button', { name: 'Pause mascot animation', exact: true }).click()
  await expect(page.locator('.ray-flight')).toHaveAttribute('data-motion', 'still')
  expect(await wings()).not.toEqual(first)
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Resume mascot animation', exact: true })
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.ray-flight')).toHaveAttribute('data-motion', 'still')
})

test('reduced motion keeps static illustrations and can change while the page is open', async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('./')
  await expect(page.locator('.ray-layer')).toBeHidden()
  await expect(page.locator('.hero-ray')).toHaveCSS('opacity', '1')
  await expect(page.locator('.ray-dock img')).toHaveCSS('opacity', '1')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(page.locator('.home-page')).toHaveAttribute('data-ray-ready', 'true')
  await expect(page.locator('.ray-layer')).toBeVisible()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.ray-layer')).toBeHidden()
  await expect(page.locator('.hero-ray')).toHaveCSS('opacity', '1')
})

test('the journey still works when a graphics context is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      attributes?: unknown
    ) {
      return type === 'webgl' ? null : original.call(this, type, attributes)
    } as typeof original
  })
  await page.goto('./')
  await expect(page.locator('.home-page')).toHaveAttribute('data-ray-ready', 'true')
  await expect(page.locator('.ray-flight')).toHaveAttribute('data-renderer', 'image')
  await page.getByRole('button', { name: 'Pause mascot animation', exact: true }).click()
  await page.evaluate(() =>
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })
  )
  await expect(page.locator('.ray-flight')).toHaveAttribute('data-stage', 'docked')
  await expect(page.locator('.ray-flight img')).toBeVisible()
})

test('mobile resize and translated content preserve the final landing position', async ({
  page
}) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Pause mascot animation', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '한국어', exact: true }).click()
  await page.evaluate(() =>
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })
  )
  await expect(page.locator('.ray-flight')).toHaveAttribute('data-stage', 'docked')
  await expect.poll(async () => (await center(page, '.ray-flight')).x).toBeCloseTo(195, 0)
  const dock = await center(page, '.ray-dock img')
  await expect
    .poll(async () => Math.abs((await center(page, '.ray-flight')).y - dock.y))
    .toBeLessThan(4)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.locator('.site-footer').getByRole('link', { name: '사용 문서', exact: true }).click()
  await expect(page.locator('.ray-layer')).toHaveCount(0)
})
