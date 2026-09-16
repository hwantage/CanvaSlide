import { expect, test } from '@playwright/test'

test('native Open, Save As and repeated Save retain the exact bridge path', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('canvas-viewport')).toBeVisible()
  // Install after browser startup to exercise the real UI against a controlled native IO boundary.
  await page.evaluate(() => {
    const original = {
      encoding: 'unix-bytes',
      bytes: [47, 100, 101, 99, 107, 255, 46, 99, 97, 110, 118, 97, 115, 108, 105, 100, 101],
      display: '/deck�.canvaslide'
    }
    const copy = {
      ...original,
      bytes: [47, 99, 111, 112, 121, 255, ...new TextEncoder().encode('.canvaslide')],
      display: '/copy�.canvaslide'
    }
    const writes: unknown[] = []
    const contents = JSON.stringify({
      version: 2,
      name: '',
      elements: {},
      order: [],
      assets: {},
      camera: { x: 0, y: 0, zoom: 1 },
      settings: { transitionMs: 1000, background: 'dots', frameBorder: 'solid' }
    })
    Object.assign(window, {
      __pathTest: { original, copy, writes },
      __TAURI_INTERNALS__: {
        metadata: { currentWindow: { label: 'main' } },
        invoke: async (command: string, args: { path: unknown }) => {
          if (command === 'pick_document_path') {
            return original
          }
          if (command === 'read_document') {
            if (JSON.stringify(args.path) !== JSON.stringify(original)) {
              throw new Error('Read used a different path')
            }
            return contents
          }
          if (command === 'pick_document_save_path') {
            return copy
          }
          if (command === 'write_document') {
            writes.push(args)
            return args.path
          }
          if (command === 'plugin:dialog|message') {
            throw new Error('Unexpected file error dialog')
          }
          return null
        }
      }
    })
  })
  await page.getByRole('button', { name: /^Open/ }).click()
  await expect(page.getByLabel('Document name')).toHaveValue('deck�')
  await expect(page).toHaveTitle('deck� — CanvaSlide')
  await page.getByLabel('Document name').fill('Edited')
  await page.getByRole('button', { name: /^Save \(/ }).click()
  await page.getByRole('button', { name: /^Save as/ }).click()
  await page.getByRole('button', { name: /^Save \(/ }).click()
  await expect
    .poll(() =>
      page.evaluate(() => {
        const { original, copy, writes } = (
          window as unknown as {
            __pathTest: {
              original: unknown
              copy: unknown
              writes: { path: unknown; normalizeExtension: boolean }[]
            }
          }
        ).__pathTest
        return {
          targets: writes.map((write) =>
            JSON.stringify(write.path) === JSON.stringify(original)
              ? 'original'
              : JSON.stringify(write.path) === JSON.stringify(copy)
                ? 'copy'
                : 'wrong'
          ),
          normalize: writes.map((write) => write.normalizeExtension)
        }
      })
    )
    .toEqual({ targets: ['original', 'copy', 'copy'], normalize: [false, true, false] })
})
