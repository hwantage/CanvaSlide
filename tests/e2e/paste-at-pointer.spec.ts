import { expect, test, type Page, type Locator } from '@playwright/test'
import { dragOnCanvas, primaryModifier } from './canvas-gestures'

async function moveOnCanvas(page: Page, x: number, y: number) {
  await page.getByTestId('canvas-viewport').hover({ position: { x, y } })
}

// WebKit and native mouse clicks round client coordinates on the fractional-height toolbar.
async function expectTop(element: Locator, top: number) {
  await expect
    .poll(async () =>
      Math.abs(Number.parseFloat(await element.evaluate((el) => getComputedStyle(el).top)) - top)
    )
    .toBeLessThan(1)
}

async function expectPath(element: Locator, expected: number[]) {
  await expect
    .poll(async () => {
      const actual = (await element.getAttribute('d'))!.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
      return (
        actual.length === expected.length && actual.every((n, i) => Math.abs(n - expected[i]!) < 1)
      )
    })
    .toBe(true)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('canvas-viewport')).toBeVisible()
})

test('pastes at the moved pointer and cascades until it moves again @webkit', async ({ page }) => {
  const mod = await primaryModifier(page)
  await page.keyboard.press('r')
  await dragOnCanvas(page, [200, 200], [320, 280])
  await page.keyboard.press(`${mod}+c`)
  await moveOnCanvas(page, 740, 500)
  await page.keyboard.press(`${mod}+v`)
  const shapes = page.locator('[data-element-type="shape"]')
  await expect(shapes).toHaveCount(2)
  await expect(shapes.nth(1)).toHaveCSS('left', '680px')
  await expectTop(shapes.nth(1), 460)
  await page.keyboard.press(`${mod}+v`)
  await expect(shapes).toHaveCount(3)
  await expect(shapes.nth(2)).toHaveCSS('left', '704px')
  await moveOnCanvas(page, 600, 650)
  await page.keyboard.press(`${mod}+v`)
  await expect(shapes).toHaveCount(4)
  await expect(shapes.nth(3)).toHaveCSS('left', '540px')
  await expectTop(shapes.nth(3), 610)
  await page.keyboard.press(`${mod}+z`)
  await expect(shapes).toHaveCount(3)
  await page.keyboard.press(`${mod}+Shift+z`)
  await expect(shapes).toHaveCount(4)
  await expect(shapes.nth(3)).toHaveCSS('left', '540px')
  await page.keyboard.press(`${mod}+c`)
  await page.keyboard.press(`${mod}+v`)
  await expect(shapes).toHaveCount(5)
  await expect(shapes.nth(4)).toHaveCSS('left', '564px')
})

test('uses the current camera after zooming and panning with a stationary pointer @webkit', async ({
  page
}) => {
  const mod = await primaryModifier(page)
  await page.keyboard.press('r')
  await dragOnCanvas(page, [200, 200], [320, 280])
  await page.keyboard.press(`${mod}+c`)
  await moveOnCanvas(page, 700, 500)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -280)
  await page.keyboard.up('Control')
  await expect(page.getByTestId('zoom-level')).not.toHaveText('100%')
  const original = page.locator('[data-element-type="shape"]').first()
  const before = await original.boundingBox()
  await page.mouse.wheel(4000, 2000)
  await expect.poll(async () => (await original.boundingBox())!.x).not.toBe(before!.x)
  await page.keyboard.press(`${mod}+v`)
  const pasted = page.locator('[data-element-type="shape"]').nth(1)
  await expect(pasted).toBeVisible()
  const canvas = (await page.getByTestId('canvas-viewport').boundingBox())!
  await expect
    .poll(async () => {
      const box = (await pasted.boundingBox())!
      return (
        Math.abs(box.x + box.width / 2 - canvas.x - 700) +
        Math.abs(box.y + box.height / 2 - canvas.y - 500)
      )
    })
    .toBeLessThan(1)
})

test('continues source offsets after pointer paste and resumes at re-entry @webkit', async ({
  page
}) => {
  const mod = await primaryModifier(page)
  await page.keyboard.press('r')
  await dragOnCanvas(page, [200, 200], [320, 280])
  await page.keyboard.press(`${mod}+c`)
  const shapes = page.locator('[data-element-type="shape"]')
  await page.keyboard.press(`${mod}+v`)
  await expect(shapes).toHaveCount(2)
  await expect(shapes.nth(1)).toHaveCSS('left', '224px')
  await page.keyboard.press(`${mod}+v`)
  await expect(shapes).toHaveCount(3)
  await expect(shapes.nth(2)).toHaveCSS('left', '248px')
  await moveOnCanvas(page, 740, 500)
  await page.keyboard.press(`${mod}+v`)
  await expect(shapes).toHaveCount(4)
  await expect(shapes.nth(3)).toHaveCSS('left', '680px')
  await page.mouse.move(10, 10)
  await page.keyboard.press(`${mod}+v`)
  await expect(shapes).toHaveCount(5)
  await expect(shapes.nth(4)).toHaveCSS('left', '296px')
  await moveOnCanvas(page, 740, 500)
  await page.keyboard.press(`${mod}+v`)
  await expect(shapes).toHaveCount(6)
  await expect(shapes.nth(5)).toHaveCSS('left', '680px')
})

test('native clipboard events preserve grouped layout and reconnect copied hosts @webkit', async ({
  page
}) => {
  await page.keyboard.press('r')
  await dragOnCanvas(page, [100, 100], [200, 200])
  await page.keyboard.press('r')
  await dragOnCanvas(page, [300, 100], [400, 200])
  await page.keyboard.press('l')
  await dragOnCanvas(page, [200, 150], [300, 150])
  const mod = await primaryModifier(page)
  await page.keyboard.press(`${mod}+a`)
  await page.keyboard.press(`${mod}+g`)
  const payload = await page.evaluate(() => {
    const data = new DataTransfer()
    document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true }))
    return data.getData('text/plain')
  })
  await moveOnCanvas(page, 700, 500)
  await page.evaluate((text) => {
    const data = new DataTransfer()
    data.setData('text/plain', text)
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  }, payload)
  const shapes = page.locator('[data-element-type="shape"]')
  await expect(shapes).toHaveCount(4)
  await expect(shapes.nth(2)).toHaveCSS('left', '550px')
  await expectTop(shapes.nth(2), 450)
  await expect(shapes.nth(3)).toHaveCSS('left', '750px')
  const paths = page.getByTestId('connector-path')
  await expectPath(paths.nth(1), [650, 500, 750, 500])
  await expect(page.getByRole('heading', { name: 'Group · 3 elements' })).toBeVisible()
  await page.keyboard.press(`${mod}+Shift+g`)
  await page.keyboard.press('Escape')
  await page.keyboard.down(mod)
  await dragOnCanvas(page, [800, 500], [800, 600])
  await page.keyboard.up(mod)
  await expectPath(paths.nth(1), [650, 500, 750, 600])
  await expectPath(paths.nth(0), [200, 150, 300, 150])
})

test('resets the cascade for changed native clipboard contents at the same pointer @webkit', async ({
  page
}) => {
  await page.keyboard.press('r')
  await dragOnCanvas(page, [200, 200], [320, 280])
  const payload = await page.evaluate(() => {
    const data = new DataTransfer()
    document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true }))
    return data.getData('text/plain')
  })
  await moveOnCanvas(page, 740, 500)
  const shapes = page.locator('[data-element-type="shape"]')
  for (const [index, text] of [
    payload,
    payload.replace('rectangle', 'ellipse'),
    payload.replace('rectangle', 'ellipse')
  ].entries()) {
    await page.evaluate((value) => {
      const data = new DataTransfer()
      data.setData('text/plain', value)
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
    }, text)
    await expect(shapes).toHaveCount(index + 2)
    await expect(shapes.nth(index + 1)).toHaveCSS('left', index === 2 ? '704px' : '680px')
    await expectTop(shapes.nth(index + 1), index === 2 ? 484 : 460)
  }
})

test('context-menu object paste keeps the original source offset @webkit', async ({ page }) => {
  const mod = await primaryModifier(page)
  await page.keyboard.press('r')
  await dragOnCanvas(page, [200, 200], [320, 280])
  await page.keyboard.press(`${mod}+c`)
  await page.getByTestId('canvas-viewport').click({ position: { x: 700, y: 500 }, button: 'right' })
  await page.getByRole('menuitem', { name: /^Paste\s/ }).click()
  const shapes = page.locator('[data-element-type="shape"]')
  await expect(shapes).toHaveCount(2)
  await expect(shapes.nth(1)).toHaveCSS('left', '224px')
  await expectTop(shapes.nth(1), 224)
})

test('keeps native paste inside a text editor after copying an object @webkit', async ({
  page
}) => {
  const mod = await primaryModifier(page)
  await page.keyboard.press('r')
  await dragOnCanvas(page, [200, 200], [320, 280])
  await page.keyboard.press(`${mod}+c`)
  await moveOnCanvas(page, 740, 500)
  await page.keyboard.press('Enter')
  const editor = page.locator('.canvas-text-editor')
  await expect(editor).toBeFocused()
  await editor.evaluate((element) => {
    const data = new DataTransfer()
    data.setData('text/plain', 'Inline paste')
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  })
  await expect(editor).toHaveText('Inline paste')
  await expect(page.locator('[data-element-type="shape"]')).toHaveCount(1)
})

test.describe('Windows shortcut routing', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36'
  })
  test('uses Ctrl for immediate offsets and pointer-directed paste', async ({ page }) => {
    expect(await primaryModifier(page)).toBe('Control')
    await page.keyboard.press('r')
    await dragOnCanvas(page, [200, 200], [320, 280])
    await page.keyboard.press('Control+c')
    await page.keyboard.press('Control+v')
    const shapes = page.locator('[data-element-type="shape"]')
    await expect(shapes).toHaveCount(2)
    await expect(shapes.nth(1)).toHaveCSS('left', '224px')
    await moveOnCanvas(page, 740, 500)
    await page.keyboard.press('Control+v')
    await expect(shapes).toHaveCount(3)
    await expect(shapes.nth(2)).toHaveCSS('left', '680px')
  })
})
