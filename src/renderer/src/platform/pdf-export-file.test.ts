import { beforeEach, expect, it, vi } from 'vitest'
import { savePdfExport } from './pdf-export-file'

const { invoke, save } = vi.hoisted(() => ({ invoke: vi.fn(), save: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ save }))
vi.mock('./tauri-runtime', () => ({ isTauriRuntime: () => true }))

beforeEach(() => {
  vi.clearAllMocks()
})

// Why: the shell shows the export dialog itself; the webview can neither open it nor name the path.
it('leaves the PDF save dialog and the write to one native command', async () => {
  invoke.mockResolvedValue(null)
  const pdf = new TextEncoder().encode('%PDF') as Uint8Array<ArrayBuffer>
  expect(await savePdfExport(pdf, 'deck.pdf')).toBeNull()
  expect(invoke.mock.calls).toEqual([
    ['save_pdf_export', { defaultName: 'deck.pdf', contentsBase64: 'JVBERg==' }]
  ])
  expect(save).not.toHaveBeenCalled()
})
