import { useExampleStore, cancelExampleRequest } from './example-store'
import { loadExampleDocument } from '@/lib/document/load-example-document'
import { isTauriRuntime } from '@/platform/tauri-runtime'
vi.mock('@/lib/document/load-example-document', () => ({ loadExampleDocument: vi.fn() }))
vi.mock('@/platform/tauri-runtime', () => ({ isTauriRuntime: vi.fn(() => false) }))
beforeEach(() => {
  vi.clearAllMocks()
  useExampleStore.setState({ open: false, busy: false, error: null })
})
afterEach(() => cancelExampleRequest())

it.each(['', '?example=flowchart&share=bad', '?share=bad'])(
  'preserves ordinary or shared startup: %s',
  async (search) => {
    await useExampleStore.getState().openLink(search)
    expect(loadExampleDocument).not.toHaveBeenCalled()
    expect(useExampleStore.getState().open).toBe(false)
  }
)
it('ignores web examples in Tauri', async () => {
  vi.mocked(isTauriRuntime).mockReturnValueOnce(true)
  await useExampleStore.getState().openLink('?example=flowchart')
  expect(loadExampleDocument).not.toHaveBeenCalled()
})
it('rejects duplicate example parameters without choosing one', async () => {
  await useExampleStore.getState().openLink('?example=flowchart&example=erd')
  expect(loadExampleDocument).not.toHaveBeenCalled()
  expect(useExampleStore.getState()).toMatchObject({ open: true, busy: false, error: 'unknown' })
})
it('allows StrictMode cleanup followed by a fresh request', async () => {
  const signals: AbortSignal[] = []
  vi.mocked(loadExampleDocument).mockImplementation(async (_id, signal) => {
    signals.push(signal)
  })
  const first = useExampleStore.getState().openLink('?example=flowchart')
  cancelExampleRequest()
  await first
  await useExampleStore.getState().openLink('?example=flowchart')
  expect(signals.map((signal) => signal.aborted)).toEqual([true, false])
  expect(useExampleStore.getState()).toMatchObject({ open: false, busy: false })
})

it.each(['', '?share=another-link'])(
  'closes a pending example dialog when another entry takes ownership: %s',
  async (search) => {
    let finish!: () => void
    let signal!: AbortSignal
    vi.mocked(loadExampleDocument).mockImplementation((_id, request) => {
      signal = request
      return new Promise((resolve) => {
        finish = resolve
      })
    })
    const pending = useExampleStore.getState().openLink('?example=flowchart')
    expect(useExampleStore.getState().busy).toBe(true)
    await useExampleStore.getState().openLink(search)
    expect(signal.aborted).toBe(true)
    expect(useExampleStore.getState()).toMatchObject({ open: false, busy: false, error: null })
    finish()
    await pending
    expect(useExampleStore.getState().open).toBe(false)
  }
)
