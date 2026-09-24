import { beforeEach, expect, it, vi } from 'vitest'
import { saveHtmlExport } from './html-export-file'

const { invoke, save } = vi.hoisted(() => ({ invoke: vi.fn(), save: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ save }))
vi.mock('./tauri-runtime', () => ({ isTauriRuntime: () => true }))

beforeEach(() => {
  vi.clearAllMocks()
})

// Why: the shell shows the export dialog itself; the webview can neither open it nor name the path.
it('leaves the HTML save dialog and the write to one native command', async () => {
  const written = { encoding: 'unix-bytes', bytes: [47, 100, 255], display: '/d�' }
  invoke.mockResolvedValue(written)
  expect(await saveHtmlExport('<!doctype html>', 'deck.html')).toEqual(written)
  expect(invoke.mock.calls).toEqual([
    ['save_html_export', { defaultName: 'deck.html', contents: '<!doctype html>' }]
  ])
  expect(save).not.toHaveBeenCalled()
})
