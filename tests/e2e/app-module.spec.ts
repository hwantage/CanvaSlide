import { expect, test } from '@playwright/test'
import { appModuleUrl } from './app-module'
import { waitForEditor } from './editor-ready'

test('page code reaches the running app module without Resource Timing', async ({ page }) => {
  // An empty buffer stands in for startup overflowing the default 250 entries.
  await page.addInitScript(() => performance.setResourceTimingBufferSize(0))
  await page.goto('/')
  await waitForEditor(page)
  await page.evaluate(async (url) => {
    const { useDocumentStore } = await import(url)
    const store = useDocumentStore.getState()
    store.loadDocument({ ...store.document, name: 'Reached from page code' }, null)
  }, appModuleUrl('store/document-store.ts'))
  await expect(page).toHaveTitle(/^Reached from page code/)
})

test('names a missing app module before the page tries to load it', () => {
  expect(() => appModuleUrl('store/no-such-store.ts')).toThrow(
    'No app module at src/renderer/src/store/no-such-store.ts'
  )
  // Each of these exists on a case-insensitive disk, yet none is a module the app imports.
  for (const path of [
    'store/Document-Store.ts',
    'Store/document-store.ts',
    'store',
    '../index.html'
  ]) {
    expect(() => appModuleUrl(path)).toThrow(`No app module at src/renderer/src/${path}`)
  }
})
