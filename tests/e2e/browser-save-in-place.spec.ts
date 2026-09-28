import { expect, test, type Page } from '@playwright/test'
import { encodeDocumentFixture, readSavedDocument } from './saved-document'
import {
  createEmptyDocument,
  defaultShapeStyle,
  defaultTextStyle
} from '../../src/shared/canvas/element-types'

/**
 * The pickers as this spec fakes them: Chromium is launched without the real ones (see
 * `playwright.config.ts`), so the app takes the handle path only where a spec installs these.
 */
type FakeFileSystemAccess = {
  /** File name → text contents, as the last committed write left them. */
  files: Record<string, string>
  /** Every committed write, oldest first. */
  writes: { name: string; text: string }[]
  openPickerCalls: number
  savePickerCalls: number
  /** The file the next open picker returns; null dismisses the picker. */
  nextOpen: string | null
  /** The file the next save picker returns; null dismisses the picker. */
  nextSave: string | null
}
type FakeOptions = Pick<FakeFileSystemAccess, 'files' | 'nextOpen'>
type FakeWindow = Window & { __fakeFileSystemAccess: FakeFileSystemAccess }

/** One handle per file name; a write reaches `files` only when its stream closes, as in the browser. */
async function installFakeFileSystemAccess(page: Page, options: FakeOptions): Promise<void> {
  await page.addInitScript((options: FakeOptions) => {
    const state: FakeFileSystemAccess = {
      files: { ...options.files },
      writes: [],
      openPickerCalls: 0,
      savePickerCalls: 0,
      nextOpen: options.nextOpen,
      nextSave: null
    }
    const handles = new Map<string, unknown>()
    const handleFor = (name: string): unknown => {
      let handle = handles.get(name)
      if (!handle) {
        handle = {
          kind: 'file',
          name,
          getFile: () => Promise.resolve(new File([state.files[name] ?? ''], name)),
          createWritable: () => {
            const chunks: BlobPart[] = []
            return Promise.resolve({
              write: (chunk: BlobPart) => {
                chunks.push(chunk)
                return Promise.resolve()
              },
              close: async () => {
                const text = await new Blob(chunks).text()
                state.files[name] = text
                state.writes.push({ name, text })
              },
              abort: () => Promise.resolve()
            })
          }
        }
        handles.set(name, handle)
      }
      return handle
    }
    const dismissed = () => new DOMException('The user aborted a request.', 'AbortError')
    const define = (name: string, value: unknown) =>
      Object.defineProperty(window, name, { value, configurable: true, writable: true })
    define('showOpenFilePicker', () => {
      state.openPickerCalls += 1
      return state.nextOpen
        ? Promise.resolve([handleFor(state.nextOpen)])
        : Promise.reject(dismissed())
    })
    define('showSaveFilePicker', () => {
      state.savePickerCalls += 1
      return state.nextSave
        ? Promise.resolve(handleFor(state.nextSave))
        : Promise.reject(dismissed())
    })
    define('__fakeFileSystemAccess', state)
  }, options)
}

function readFakeFileSystemAccess(page: Page): Promise<FakeFileSystemAccess> {
  return page.evaluate(() => (window as unknown as FakeWindow).__fakeFileSystemAccess)
}

/** Points the next save picker at a file, or dismisses it with null. */
function setNextSave(page: Page, nextSave: string | null): Promise<void> {
  return page.evaluate((nextSave) => {
    ;(window as unknown as FakeWindow).__fakeFileSystemAccess.nextSave = nextSave
  }, nextSave)
}

/** An unnamed document, so the editor names it after the file it came from. */
function unnamedShapeDocument(): string {
  const document = createEmptyDocument('')
  document.elements.box = {
    id: 'box',
    type: 'shape',
    shape: 'rectangle',
    x: 100,
    y: 100,
    width: 200,
    height: 120,
    text: 'Saved content',
    textStyle: defaultTextStyle,
    style: defaultShapeStyle
  }
  document.order = ['box']
  return encodeDocumentFixture(document).toString()
}

function boxX(text: string | undefined): number | undefined {
  return readSavedDocument(Buffer.from(text ?? '')).elements.box?.x
}

test('Save writes back to the opened file through its handle, without a download', async ({
  page
}) => {
  await installFakeFileSystemAccess(page, {
    files: { 'deck.canvaslide': unnamedShapeDocument() },
    nextOpen: 'deck.canvaslide'
  })
  const downloads: string[] = []
  page.on('download', (download) => downloads.push(download.suggestedFilename()))
  await page.goto('/')
  await page.getByRole('button', { name: /^Open/ }).click()
  const box = page.locator('[data-element-id="box"]')
  await expect(box).toBeVisible()
  await expect(page).toHaveTitle('deck — CanvaSlide')

  const mod = await page.evaluate(() => (/Mac/.test(navigator.userAgent) ? 'Meta' : 'Control'))
  const bounds = (await box.boundingBox())!
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveTitle('• deck — CanvaSlide')
  await page.keyboard.press(`${mod}+s`)
  await expect(page).toHaveTitle('deck — CanvaSlide')
  let fake = await readFakeFileSystemAccess(page)
  expect(fake.writes.map((write) => write.name)).toEqual(['deck.canvaslide'])
  expect(boxX(fake.files['deck.canvaslide'])).toBe(101)
  expect(fake).toMatchObject({ openPickerCalls: 1, savePickerCalls: 0 })

  // Save As adopts the chosen handle; the next Save writes there and leaves the original alone.
  await setNextSave(page, 'copy.canvaslide')
  await page.keyboard.press(`${mod}+Shift+s`)
  await expect.poll(async () => (await readFakeFileSystemAccess(page)).writes.length).toBe(2)
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveTitle('• deck — CanvaSlide')
  await page.keyboard.press(`${mod}+s`)
  await expect(page).toHaveTitle('deck — CanvaSlide')
  fake = await readFakeFileSystemAccess(page)
  expect(fake.writes.map((write) => write.name)).toEqual([
    'deck.canvaslide',
    'copy.canvaslide',
    'copy.canvaslide'
  ])
  expect(boxX(fake.files['deck.canvaslide'])).toBe(101)
  expect(boxX(fake.files['copy.canvaslide'])).toBe(102)
  expect(fake.savePickerCalls).toBe(1)

  // A dismissed Save As keeps the unsaved work and the handle.
  await setNextSave(page, null)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press(`${mod}+Shift+s`)
  await expect.poll(async () => (await readFakeFileSystemAccess(page)).savePickerCalls).toBe(2)
  await expect(page).toHaveTitle('• deck — CanvaSlide')
  await page.keyboard.press(`${mod}+s`)
  await expect(page).toHaveTitle('deck — CanvaSlide')
  fake = await readFakeFileSystemAccess(page)
  expect(fake.writes).toHaveLength(4)
  expect(boxX(fake.files['copy.canvaslide'])).toBe(103)

  // A new document drops the handle, so its first Save asks where to write.
  await page.getByRole('button', { name: /^New/ }).click()
  await expect(page).toHaveTitle('Untitled — CanvaSlide')
  await setNextSave(page, 'fresh.canvaslide')
  await page.keyboard.press(`${mod}+s`)
  await expect.poll(async () => (await readFakeFileSystemAccess(page)).writes.length).toBe(5)
  fake = await readFakeFileSystemAccess(page)
  expect(fake.writes.at(-1)?.name).toBe('fresh.canvaslide')
  expect(fake.savePickerCalls).toBe(3)
  expect(downloads).toEqual([])
})
