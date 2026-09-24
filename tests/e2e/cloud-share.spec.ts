import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { onRequest as createShare } from '../../functions/api/share'
import { onRequest as getShare } from '../../functions/api/share/[id]'
import { createEmptyDocument, type CanvasDocument } from '../../src/shared/canvas/element-types'
import type { ShareEnvironment } from '../../src/cloud-share/share-api'
import { dragOnCanvas, primaryModifier } from './canvas-gestures'
import { readSavedDocument } from './saved-document'

const id = 'abcdefghijklmnopqr_-1'

function sharedBoard() {
  return {
    ...createEmptyDocument(),
    name: 'Shared presentation',
    camera: { x: -99999, y: -99999, zoom: 64 },
    elements: {
      frame: {
        id: 'frame',
        type: 'frame' as const,
        name: 'Shared frame',
        order: 0,
        x: 5000,
        y: 3000,
        width: 1200,
        height: 800
      }
    },
    order: ['frame']
  }
}

async function serveShares(page: Page, values = new Map<string, string>()) {
  const env: ShareEnvironment = {
    SHARED_DOCUMENTS: {
      get: async (key) => values.get(key) ?? null,
      put: async (key, value) => {
        values.set(key, value)
      }
    }
  }
  // Exercise the real Pages handlers, replacing only KV with an isolated in-memory namespace.
  await page.route('**/api/share{,/**}', async (route) => {
    const incoming = route.request()
    const request = new Request(incoming.url(), {
      method: incoming.method(),
      headers: incoming.headers(),
      ...(incoming.postData() === null ? {} : { body: incoming.postData()! })
    })
    const url = new URL(request.url)
    const context = { request, env, params: { id: url.pathname.split('/').at(-1)! } }
    const response = await (url.pathname === '/api/share'
      ? createShare(context)
      : getShare(context))
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.text()
    })
  })
  return values
}

test('creates, copies, and opens a snapshot with its content fitted @webkit', async ({
  page,
  context,
  browserName
}, testInfo) => {
  const values = await serveShares(page)
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Document name' }).fill('Cloud round trip')
  await page.getByTestId('canvas-viewport').click({ position: { x: 700, y: 500 } })
  await page.keyboard.press('r')
  await dragOnCanvas(page, [300, 300], [550, 450])
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Share', exact: true })
  await expect(dialog).toContainText('anyone with the link')
  await expect(dialog).toContainText('automatically deleted 24 hours after creation')
  await expect(dialog.getByRole('radio', { name: /View slide show only/ })).toBeChecked()
  await expect(dialog.getByRole('button', { name: 'Copy link' })).toBeDisabled()
  await expect(dialog).toContainText('Add a presentation frame')
  expect(values.size).toBe(0)
  await dialog.getByRole('radio', { name: /Edit a copy/ }).check()
  await dialog.getByRole('button', { name: 'Copy link' }).click()
  const field = dialog.getByRole('textbox', { name: 'Shareable URL' })
  await expect(field).toHaveValue(/\?share=[\w-]{21}$/)
  const url = await field.inputValue()
  expect(values.size).toBe(1)
  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const previous = await page.evaluate(() => navigator.clipboard.readText())
    try {
      await dialog.getByRole('button', { name: 'Copy link' }).click()
      await expect(dialog.getByRole('status')).toHaveText('Link copied.')
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url)
    } finally {
      await page.evaluate((text) => navigator.clipboard.writeText(text), previous)
    }
  }
  await testInfo.attach('share-dialog', { body: await page.screenshot(), contentType: 'image/png' })
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  // A share does not mark the working document saved or modify its undo history.
  await expect(page.getByText('Unsaved', { exact: true })).toBeVisible()
  await page.keyboard.press(`${await primaryModifier(page)}+z`)
  await expect(page.locator('[data-element-type="shape"]')).toHaveCount(0)
  page.on('dialog', (prompt) => prompt.accept())
  await page.goto(url)
  await expect(page.getByRole('textbox', { name: 'Document name' })).toHaveValue('Cloud round trip')
  const shape = page.locator('[data-element-type="shape"]')
  await expect(shape).toHaveCount(1)
  const bounds = await shape.boundingBox()
  const viewport = await page.getByTestId('canvas-viewport').boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(viewport!.x)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.x + viewport!.width)
  await expect(page.getByText('Unsaved', { exact: true })).toHaveCount(0)
  await expect(page).toHaveURL(url)
  await page.reload()
  await expect(shape).toHaveCount(1)
  await expect(page.getByRole('textbox', { name: 'Document name' })).toHaveValue('Cloud round trip')
  await page.getByRole('textbox', { name: 'Document name' }).fill('My edited copy')
  await expect(page.getByText('Unsaved', { exact: true })).toBeVisible()
  const saved = JSON.parse(values.get(`share:${new URL(url).searchParams.get('share')}`)!)
  expect(saved.access).toBe('edit')
  expect(saved.document.name).toBe('Cloud round trip')
  await page.getByRole('button', { name: /^New \(/ }).click()
  await expect(shape).toHaveCount(0)
  await expect(page).not.toHaveURL(/share=/)
})

test('publishes a slideshow-only link with navigation and no path back to editing @webkit', async ({
  page
}, testInfo) => {
  const document: CanvasDocument = sharedBoard()
  document.settings.transitionMs = 0
  document.elements.second = {
    id: 'second',
    type: 'frame',
    name: 'Second frame',
    order: 1,
    x: 7000,
    y: 3000,
    width: 1200,
    height: 800
  }
  document.elements.text = {
    id: 'text',
    type: 'text',
    x: 5200,
    y: 3200,
    width: 300,
    height: 50,
    text: 'Read only content',
    textStyle: { color: '#111111', fontSize: 24, align: 'left', bold: false }
  }
  document.order.push('second', 'text')
  const values = await serveShares(
    page,
    new Map([[`share:${id}`, JSON.stringify({ access: 'edit', document })]])
  )
  await page.goto(`/?share=${id}`)
  await expect(page.getByRole('textbox', { name: 'Document name' })).toHaveValue(document.name)
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Share' })
  await expect(dialog.getByRole('radio', { name: /View slide show only/ })).toBeChecked()
  await dialog.getByRole('button', { name: 'Copy link' }).click()
  const field = dialog.getByRole('textbox', { name: 'Shareable URL' })
  await expect(field).toHaveValue(/\?share=[\w-]{21}$/)
  const url = await field.inputValue()
  await expect(dialog.getByRole('radio', { name: /View slide show only/ })).toBeChecked()
  await expect(dialog.getByRole('radio', { name: /Edit a copy/ })).toBeEnabled()
  const snapshotKey = `share:${new URL(url).searchParams.get('share')}`
  const stored = values.get(snapshotKey)
  expect(JSON.parse(stored!).access).toBe('present')

  await page.goto(url)
  await expect(page.getByTestId('shared-slide-show')).toBeVisible()
  await expect(page.getByTestId('presentation-counter')).toContainText('1 / 2')
  await expect(page.getByRole('textbox', { name: 'Document name' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Exit/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: /Next frame/ }).click()
  await expect(page.getByTestId('presentation-counter')).toContainText('2 / 2')
  await page.keyboard.press('o')
  await expect(page.getByTestId('overview-frame')).toHaveCount(2)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('overview-frame')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('shared-slide-show')).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByTestId('presentation-counter')).toContainText('1 / 2')
  await page.getByText('Read only content', { exact: true }).dblclick({ force: true })
  await expect(page.locator('[contenteditable="true"]')).toHaveCount(0)
  await page.keyboard.press('Delete')
  await page.keyboard.press('r')
  await dragOnCanvas(page, [300, 300], [550, 450])
  await page.evaluate(() => {
    const clipboard = new DataTransfer()
    clipboard.setData('text/plain', 'Cannot paste this')
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard }))
    const files = new DataTransfer()
    files.items.add(new File(['{}'], 'replacement.canvaslide', { type: 'application/json' }))
    window.document
      .querySelector('[data-testid="canvas-viewport"]')!
      .dispatchEvent(
        new DragEvent('drop', { dataTransfer: files, bubbles: true, cancelable: true })
      )
  })
  await expect(page.getByText('Read only content', { exact: true })).toBeVisible()
  await expect(page.getByText('Cannot paste this', { exact: true })).toHaveCount(0)
  await expect(page.locator('[data-element-type="shape"]')).toHaveCount(0)
  await testInfo.attach('slideshow-only-share', {
    body: await page.screenshot(),
    contentType: 'image/png'
  })
  await page.reload()
  await expect(page.getByTestId('shared-slide-show')).toBeVisible()
  await page.goto(`${url}&access=edit&mode=edit`)
  await expect(page.getByTestId('shared-slide-show')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Document name' })).toHaveCount(0)
  expect(values.get(snapshotKey)).toBe(stored)
})

test('slideshow-only shares retain linked-video playback and expansion @webkit', async ({
  page,
  baseURL
}) => {
  const document: CanvasDocument = sharedBoard()
  document.settings.transitionMs = 0
  document.elements.video = {
    id: 'video',
    type: 'video',
    url: `${baseURL}/shared-clip.mp4`,
    autoplay: true,
    x: 5100,
    y: 3100,
    width: 640,
    height: 360
  }
  document.order.push('video')
  await page.route('**/shared-clip.mp4', async (route) =>
    route.fulfill({
      body: await readFile('tests/fixtures/linked-video.mp4'),
      contentType: 'video/mp4'
    })
  )
  await serveShares(
    page,
    new Map([[`share:${id}`, JSON.stringify({ access: 'present', document })]])
  )
  await page.goto(`/?share=${id}`)
  const video = page.locator('[data-element-type="video"]')
  await expect(page.getByTestId('shared-slide-show')).toBeVisible()
  await expect(video).toHaveAttribute('data-playback', 'playing')
  await video.getByRole('button', { name: 'Pause video', exact: true }).click()
  await expect(video).toHaveAttribute('data-playback', 'paused')
  await video.getByRole('button', { name: 'Expand video', exact: true }).click()
  await expect(video).toHaveAttribute('data-expanded', 'true')
  await page.keyboard.press('Escape')
  await expect(video).not.toHaveAttribute('data-expanded')
  await expect(page.getByTestId('shared-slide-show')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Document name' })).toHaveCount(0)
})

test('ignores a stored camera pointing at empty space and preserves other URL parameters @webkit', async ({
  page
}) => {
  await serveShares(
    page,
    new Map([[`share:${id}`, JSON.stringify({ access: 'edit', document: sharedBoard() })]])
  )
  await page.goto(`/?lang=en&share=${id}#canvas`)
  await expect(page.getByRole('textbox', { name: 'Document name' })).toHaveValue(
    'Shared presentation'
  )
  await expect(page.getByTestId('zoom-level')).not.toHaveText('6400%')
  const frame = page.locator('[data-element-type="frame"]')
  await expect(frame).toBeInViewport()
  await expect(page).toHaveURL(new RegExp(`\\?lang=en&share=${id}#canvas$`))
})

test('quota failure offers a working local document download and a retry @webkit', async ({
  page
}) => {
  await page.route('**/api/share', (route) => route.fulfill({ status: 429, body: 'quota' }))
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Document name' }).fill('Keep locally')
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Share' })
  await dialog.getByRole('radio', { name: /Edit a copy/ }).check()
  await dialog.getByRole('button', { name: 'Copy link' }).click()
  await expect(dialog.getByRole('alert')).toContainText('request or storage limit')
  await expect(dialog.getByRole('alert')).toContainText('local .canvaslide file')
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export .canvaslide' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('Keep-locally.canvaslide')
  expect(readSavedDocument(await readFile((await file.path())!)).name).toBe('Keep locally')
  await page.unroute('**/api/share')
  await serveShares(page)
  await dialog.getByRole('button', { name: 'Copy link' }).click()
  await expect(dialog.getByRole('textbox', { name: 'Shareable URL' })).toHaveValue(/\?share=/)
})

test('missing links can be retried after KV propagation @webkit', async ({ page }) => {
  const values = await serveShares(page)
  await page.goto(`/?share=${id}`)
  const dialog = page.getByRole('dialog', { name: 'Open shared canvas' })
  await expect(dialog.getByRole('alert')).toContainText('not found')
  await expect(dialog.getByRole('alert')).toContainText('24-hour link has expired')
  await expect(dialog.getByRole('alert')).not.toContainText('local .canvaslide file')
  await expect(dialog.getByRole('button', { name: 'Export .canvaslide' })).toHaveCount(0)
  values.set(`share:${id}`, JSON.stringify({ access: 'edit', document: sharedBoard() }))
  await dialog.getByRole('button', { name: 'Try again' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Document name' })).toHaveValue(
    'Shared presentation'
  )
})

for (const format of ['raster', 'svg'] as const) {
  test(`rejects a stored tracking ${format} image before rendering or making an external request @webkit`, async ({
    page
  }) => {
    const document = {
      ...createEmptyDocument(),
      name: 'Tracking document',
      assets: {
        image: {
          id: 'image',
          mime: format === 'svg' ? 'image/svg+xml' : 'image/png',
          data:
            format === 'svg'
              ? `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><image width="100" height="100" href="https://tracker.invalid/pixel"/></svg>')}`
              : 'https://tracker.invalid/pixel',
          width: 1,
          height: 1
        }
      },
      elements: {
        image: {
          id: 'image',
          type: 'image' as const,
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          assetId: 'image',
          naturalWidth: 1,
          naturalHeight: 1
        }
      },
      order: ['image']
    }
    const external: string[] = []
    await page.route('https://tracker.invalid/**', async (route) => {
      external.push(route.request().url())
      await route.abort()
    })
    await serveShares(
      page,
      new Map([[`share:${id}`, JSON.stringify({ access: 'edit', document })]])
    )
    await page.goto(`/?share=${id}`)
    await expect(page.getByRole('alert')).toContainText('Shared images must be embedded')
    await expect(page.getByRole('textbox', { name: 'Document name' })).toHaveValue('Untitled')
    await expect(page.locator('[data-element-type="image"]')).toHaveCount(0)
    expect(external).toEqual([])
  })
}

test('rejects a stored tracking video before autoplay or provider metadata requests @webkit', async ({
  page
}) => {
  const document: CanvasDocument = sharedBoard()
  document.elements.video = {
    id: 'video',
    type: 'video',
    url: 'https://tracker.invalid/pixel',
    autoplay: true,
    x: 5100,
    y: 3100,
    width: 640,
    height: 360
  }
  document.order.push('video')
  const external: string[] = []
  await page.route('https://tracker.invalid/**', async (route) => {
    external.push(route.request().url())
    await route.abort()
  })
  await serveShares(
    page,
    new Map([[`share:${id}`, JSON.stringify({ access: 'present', document })]])
  )
  await page.goto(`/?share=${id}`)
  await expect(page.getByRole('alert')).toContainText('Shared videos must use YouTube, Vimeo')
  await expect(page.locator('video, iframe, [data-element-type="video"]')).toHaveCount(0)
  expect(external).toEqual([])
})

test('offline and malformed links show errors without offering to save an unrelated canvas @webkit', async ({
  page
}) => {
  await page.route('**/api/share/**', (route) => route.abort('internetdisconnected'))
  await page.goto(`/?share=${id}`)
  const dialog = page.getByRole('dialog', { name: 'Open shared canvas' })
  await expect(dialog.getByRole('alert')).toContainText('Check your connection')
  await expect(dialog.getByRole('alert')).not.toContainText('local .canvaslide file')
  await expect(dialog.getByRole('button', { name: 'Export .canvaslide' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Document name' })).toHaveValue('Untitled')
  await page.goto('/?share=../../bad')
  await expect(dialog.getByRole('alert')).toContainText('invalid')
  await expect(dialog.getByRole('button', { name: 'Export .canvaslide' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page).not.toHaveURL(/share=/)
})

test('a denied clipboard leaves the link selectable with manual-copy instructions', async ({
  page
}) => {
  await serveShares(page)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('denied')) },
      configurable: true
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Share' })
  await dialog.getByRole('radio', { name: /Edit a copy/ }).check()
  await dialog.getByRole('button', { name: 'Copy link' }).click()
  await expect(dialog.getByRole('status')).toContainText('copy it manually')
  await expect(dialog.getByRole('textbox', { name: 'Shareable URL' })).toHaveValue(/\?share=/)
})

test('closing a pending link cancels loading and keeps subsequent edits', async ({ page }) => {
  let finish!: () => void
  const ready = new Promise<void>((resolve) => {
    finish = resolve
  })
  await page.route('**/api/share/**', async (route) => {
    await ready
    await route.fulfill({ json: { access: 'edit', document: sharedBoard() } }).catch(() => {})
  })
  await page.goto(`/?share=${id}`)
  const dialog = page.getByRole('dialog', { name: 'Open shared canvas' })
  await expect(dialog.getByRole('status')).toContainText('Loading')
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('textbox', { name: 'Document name' }).fill('Keep edits')
  finish()
  await expect(page.getByRole('textbox', { name: 'Document name' })).toHaveValue('Keep edits')
  await expect(page.locator('[data-element-type="frame"]')).toHaveCount(0)
})
