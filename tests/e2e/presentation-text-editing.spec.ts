import { expect, test } from '@playwright/test'
import type { StoreApi } from 'zustand'
import { appModuleUrl } from './app-module'

type EditingWindow = {
  editingStores: {
    document: StoreApi<{
      document: { elements: Record<string, { text?: string }> }
      past: unknown[]
      editBaseline: unknown
      undo: () => void
      redo: () => void
    }>
    presentation: StoreApi<{
      active: boolean
      index: number
      start: (index?: number) => void
      previewTransition: (id: string) => void
    }>
    tools: StoreApi<{ editingTextId: string | null }>
    camera: StoreApi<{ isAnimating: () => boolean }>
  }
}

for (const entry of ['start', 'previewTransition', 'F5', 'Shift+F5'] as const) {
  test(`${entry} commits focused text before presenting @webkit`, async ({ page }, testInfo) => {
    await page.goto('/')
    await page.evaluate(
      async (urls) => {
        const stores = {
          document: (await import(urls.document)).useDocumentStore,
          presentation: (await import(urls.presentation)).usePresentationStore,
          tools: (await import(urls.tools)).useToolStore,
          camera: (await import(urls.camera)).useCameraStore
        }
        ;(window as unknown as EditingWindow).editingStores = stores
        const doc = stores.document.getState()
        doc.insertElement({
          id: 'opening',
          type: 'frame',
          name: 'Opening',
          order: 0,
          x: -1000,
          y: 0,
          width: 800,
          height: 600
        })
        doc.insertElement({
          id: 'frame',
          type: 'frame',
          name: 'Frame',
          order: 1,
          x: 0,
          y: 0,
          width: 800,
          height: 600
        })
        doc.insertElement({
          id: 'text',
          type: 'text',
          x: 100,
          y: 100,
          width: 400,
          height: 50,
          text: 'Original',
          textStyle: { fontSize: 32, color: '#000000', align: 'left', bold: false }
        })
        doc.updateSettings({ transitionMs: 0 })
        // Start history at the loaded fixture, so the typed session must be exactly one entry.
        stores.document.getState().loadDocument(stores.document.getState().document, null)
        stores.document.getState().setSelection(['text'])
        stores.tools.getState().setEditingTextId('text')
      },
      {
        document: appModuleUrl('store/document-store.ts'),
        presentation: appModuleUrl('store/presentation-store.ts'),
        tools: appModuleUrl('store/tool-store.ts'),
        camera: appModuleUrl('store/camera-store.ts')
      }
    )
    const editor = page.locator('.canvas-text-editor')
    await expect(editor).toBeFocused()
    await editor.fill('Final')
    await page.keyboard.press('End')
    await page.keyboard.type(' text')
    await expect(editor).toBeFocused()
    await page.keyboard.press('Shift+Home')
    // Neither path clicks or blurs the editor before asking the presentation store to enter.
    await (entry === 'F5' || entry === 'Shift+F5'
      ? page.keyboard.press(entry)
      : page.evaluate((action) => {
          if (!document.activeElement?.classList.contains('canvas-text-editor')) {
            throw new Error('Text editor lost focus before presentation entry')
          }
          const presentation = (
            window as unknown as EditingWindow
          ).editingStores.presentation.getState()
          if (action === 'start') {
            presentation.start(1)
          } else {
            presentation.previewTransition('frame')
          }
        }, entry))
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as EditingWindow).editingStores.presentation.getState().active
        )
      )
      .toBe(true)
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as EditingWindow).editingStores.camera.getState().isAnimating()
        )
      )
      .toBe(false)
    await page.screenshot({ path: testInfo.outputPath('presentation-entry.png') })
    await expect(editor).toHaveCount(0)
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { document, tools, presentation } = (window as unknown as EditingWindow)
            .editingStores
          const state = document.getState()
          return {
            editing: tools.getState().editingTextId,
            index: presentation.getState().index,
            text: state.document.elements.text,
            history: state.past.length,
            pending: state.editBaseline !== null
          }
        })
      )
      .toMatchObject({
        editing: null,
        text: { text: 'Final text' },
        history: 1,
        pending: false,
        index: entry === 'F5' ? 0 : 1
      })
    await page.keyboard.press('Escape')
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as EditingWindow).editingStores.presentation.getState().active
        )
      )
      .toBe(false)
    await page.evaluate(() =>
      (window as unknown as EditingWindow).editingStores.document.getState().undo()
    )
    await expect(page.locator('[data-element-id="text"]')).toHaveText('Original')
    await page.evaluate(() =>
      (window as unknown as EditingWindow).editingStores.document.getState().redo()
    )
    await expect(page.locator('[data-element-id="text"]')).toHaveText('Final text')
  })
}
