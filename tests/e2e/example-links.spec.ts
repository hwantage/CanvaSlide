import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { exampleCatalog } from '../../src/shared/example-catalog'
import { primaryModifier } from './canvas-gestures'

for (const example of exampleCatalog) {
  test(`opens and presents the deployed example ${example.id}`, async ({ page }) => {
    test.setTimeout(60_000)
    const document = JSON.parse(await readFile(`examples/${example.source}`, 'utf8'))
    const frames = Object.values(document.elements).filter(
      (element) => (element as { type: string }).type === 'frame'
    )
    await page.goto(`/?example=${example.id}`)
    await expect(page.getByRole('textbox', { name: 'Document name' })).toHaveValue(document.name, {
      timeout: 30_000
    })
    await expect(page.getByRole('dialog', { name: 'Open example' })).toHaveCount(0)
    await page.keyboard.press(`${await primaryModifier(page)}+Enter`)
    await expect(page.getByTestId('presentation-counter')).toContainText(`1 / ${frames.length}`)
    if (example.id === 'inside' || example.id === 'freefall') {
      await expect
        .poll(() =>
          page
            .locator('[data-element-type="image"] img')
            .evaluateAll((images) =>
              images.every(
                (image) =>
                  (image as HTMLImageElement).complete &&
                  (image as HTMLImageElement).naturalWidth > 0
              )
            )
        )
        .toBe(true)
    }
  })
}

test('ordinary startup never downloads example documents @core-interaction', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  await page.goto('/')
  await expect(page.getByRole('textbox', { name: 'Document name' })).toHaveValue('Untitled')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(requests.filter((url) => url.includes('/examples/'))).toEqual([])
})

test('direct entry and reload keep the example, while New returns to ordinary startup @core-interaction', async ({
  page
}) => {
  await page.goto('/?example=flowchart')
  const name = page.getByRole('textbox', { name: 'Document name' })
  await expect(name).toHaveValue('Order Fulfillment Flow')
  await page.reload()
  await expect(name).toHaveValue('Order Fulfillment Flow')
  await page.keyboard.press(`${await primaryModifier(page)}+n`)
  await expect(name).toHaveValue('Untitled')
  expect(new URL(page.url()).searchParams.has('example')).toBe(false)
  await page.reload()
  await expect(name).toHaveValue('Untitled')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('unknown IDs cannot request arbitrary paths @core-interaction', async ({ page }) => {
  const exampleRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/examples/')) {
      exampleRequests.push(request.url())
    }
  })
  await page.goto('/?example=..%2Fsecret')
  await expect(page.getByRole('alert')).toContainText('not in the catalog')
  expect(exampleRequests).toEqual([])
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Document name' })).toHaveValue('Untitled')
  expect(new URL(page.url()).searchParams.has('example')).toBe(false)
})

for (const failure of ['404', 'offline', 'invalid']) {
  test(`shows ${failure} without replacing the document @core-interaction`, async ({ page }) => {
    await page.route('**/examples/flowchart.canvaslide', (route) =>
      failure === 'offline'
        ? route.abort()
        : route.fulfill({
            status: failure === '404' ? 404 : 200,
            body: '<html>not a document</html>'
          })
    )
    await page.goto('/?example=flowchart')
    await expect(page.getByRole('alert')).toContainText(
      failure === '404'
        ? 'unavailable on this server'
        : failure === 'offline'
          ? 'could not be downloaded'
          : 'not a valid document'
    )
    if (failure !== 'invalid') {
      await page.unroute('**/examples/flowchart.canvaslide')
      await page.getByRole('button', { name: 'Try again' }).click()
      await expect(page.getByRole('textbox', { name: 'Document name' })).toHaveValue(
        'Order Fulfillment Flow'
      )
    } else {
      await page.getByRole('button', { name: 'Close', exact: true }).click()
      await expect(page.getByRole('textbox', { name: 'Document name' })).toHaveValue('Untitled')
    }
  })
}

test('cancelling a slow load protects subsequent edits @core-interaction', async ({ page }) => {
  let finish!: () => void
  const response = new Promise<void>((resolve) => {
    finish = resolve
  })
  const body = await readFile('examples/flowchart/order-fulfillment.canvaslide', 'utf8')
  await page.route('**/examples/flowchart.canvaslide', async (route) => {
    await response
    await route.fulfill({ body }).catch(() => {})
  })
  await page.goto('/?example=flowchart')
  await expect(page.getByRole('status')).toContainText('Loading the example')
  await page.getByRole('button', { name: 'Cancel loading' }).click()
  const name = page.getByRole('textbox', { name: 'Document name' })
  await name.fill('Keep my changes')
  await name.press('Tab')
  finish()
  await expect(name).toHaveValue('Keep my changes')
  await expect(page.getByText('Unsaved', { exact: true })).toBeVisible()
  expect(new URL(page.url()).searchParams.has('example')).toBe(false)
})
