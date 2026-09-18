import type { Page } from '@playwright/test'

/** Press, move and release inside the canvas; coordinates are px from the viewport's top-left. */
export async function dragOnCanvas(
  page: Page,
  from: [number, number],
  to: [number, number]
): Promise<void> {
  const box = await page.getByTestId('canvas-viewport').boundingBox()
  if (!box) {
    throw new Error('canvas not laid out')
  }
  await page.mouse.move(box.x + from[0], box.y + from[1])
  await page.mouse.down()
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 8 })
  await page.mouse.up()
}

/** Why: shortcuts follow the page's platform (userAgent), not the test runner's OS. */
export async function primaryModifier(page: Page): Promise<'Meta' | 'Control'> {
  return (await page.evaluate(() => /Mac/.test(navigator.userAgent))) ? 'Meta' : 'Control'
}
