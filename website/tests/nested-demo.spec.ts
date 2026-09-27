import { expect, test, type Locator } from '@playwright/test'

test.use({ deviceScaleFactor: 2 })

async function scale(world: Locator) {
  return world.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a)
}

async function settled(world: Locator) {
  await world.evaluate(
    (element) =>
      new Promise<void>((done) => {
        let last = ''
        let since = performance.now()
        const tick = () => {
          const current = getComputedStyle(element).transform
          if (current !== last) {
            last = current
            since = performance.now()
          }
          if (performance.now() - since > 180) {
            done()
          } else {
            requestAnimationFrame(tick)
          }
        }
        requestAnimationFrame(tick)
      })
  )
}

test('the real results frame zooms continuously into its nested detail on the same canvas', async ({
  page
}) => {
  await page.goto('./')
  const demo = page.locator('#experience .canvas-demo')
  const world = demo.locator('.demo-world')
  await page.locator('.story-step').first().click()
  await settled(world)
  const overviewScale = await scale(world)
  await demo.getByRole('button', { name: '2 Results', exact: true }).click()
  await settled(world)
  const resultsScale = await scale(world)
  expect(resultsScale).toBeGreaterThan(overviewScale * 2)
  const parent = await demo.locator('.demo-results-image').boundingBox()
  const child = await demo.locator('.demo-nested-frame').boundingBox()
  expect(child!.x).toBeGreaterThan(parent!.x)
  expect(child!.y).toBeGreaterThan(parent!.y)
  expect(child!.x + child!.width).toBeLessThan(parent!.x + parent!.width)
  expect(child!.y + child!.height).toBeLessThan(parent!.y + parent!.height)
  await world.evaluate((element) => element.setAttribute('data-continuity-check', 'same-world'))
  await demo.getByRole('region').focus()
  await page.keyboard.press('ArrowRight')
  const samples = await world.evaluate(
    (element) =>
      new Promise<number[]>((done) => {
        const values: number[] = []
        const start = performance.now()
        const tick = () => {
          values.push(new DOMMatrix(getComputedStyle(element).transform).a)
          if (performance.now() - start >= 1200) {
            done(values)
          } else {
            requestAnimationFrame(tick)
          }
        }
        requestAnimationFrame(tick)
      })
  )
  const detailScale = await scale(world)
  expect(detailScale).toBeGreaterThan(resultsScale * 2)
  expect(
    samples.filter((value) => value > resultsScale * 1.1 && value < detailScale * 0.9).length
  ).toBeGreaterThan(5)
  for (let index = 1; index < samples.length; index++) {
    expect(samples[index]!).toBeGreaterThanOrEqual(samples[index - 1]! - 0.001)
  }
  await expect(world).toHaveAttribute('data-continuity-check', 'same-world')
  await expect(world).toHaveCSS('opacity', '1')
  await expect(demo).toHaveAttribute('data-scene', '3')
  const resolution = await demo.locator('.demo-results-image').evaluate(async (element) => {
    const image = element as HTMLImageElement
    await image.decode()
    const bounds = image.getBoundingClientRect()
    return {
      available: image.naturalWidth,
      required: Math.ceil(bounds.width * devicePixelRatio)
    }
  })
  expect(resolution.available).toBeGreaterThanOrEqual(resolution.required)
  await page.keyboard.press('ArrowLeft')
  await settled(world)
  expect(await scale(world)).toBeCloseTo(resultsScale, 2)
  await page.keyboard.press('Escape')
  await expect(demo).toHaveAttribute('data-scene', '0')
  await settled(world)
  expect(await scale(world)).toBeCloseTo(overviewScale, 2)
})

for (const width of [320, 1440]) {
  test(`reduced motion changes nested views immediately and fits at ${width}px`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('./ko/')
    const demo = page.locator('#experience .canvas-demo')
    const world = demo.locator('.demo-world')
    await page.locator('.story-step').first().click()
    const before = await scale(world)
    await demo.getByRole('button', { name: /내부 상세/, exact: false }).click()
    await expect(demo).toHaveAttribute('data-scene', '3')
    await world.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => done())))
    const after = await scale(world)
    expect(after).toBeGreaterThan(before * 4)
    const stable = await world.evaluate(
      (element) =>
        new Promise<boolean>((done) => {
          const before = getComputedStyle(element).transform
          requestAnimationFrame(() =>
            requestAnimationFrame(() => done(getComputedStyle(element).transform === before))
          )
        })
    )
    expect(stable).toBe(true)
    await demo.locator('.demo-play').click()
    await expect(demo.locator('.demo-play')).toHaveAttribute('aria-pressed', 'false')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width
    )
  })
}
