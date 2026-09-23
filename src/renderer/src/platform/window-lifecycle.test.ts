import { installCloseGuard } from './window-lifecycle'
import { isTauriRuntime } from './tauri-runtime'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useDocumentStore, watchDocumentChanges } from '@/store/document-store'
import { createEmptyDocument, defaultTextStyle } from '@shared/canvas/element-types'
vi.mock('./tauri-runtime', () => ({ isTauriRuntime: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => {}) }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))

it.each(['confirmation', 'cleanup'])(
  'ignores measurements but protects ongoing dirty edits during native quit %s',
  async (phase) => {
    vi.useFakeTimers()
    vi.mocked(isTauriRuntime).mockReturnValue(true)
    const document = createEmptyDocument()
    document.order = ['text']
    document.elements.text = {
      id: 'text',
      type: 'text',
      text: 'Hello',
      x: 0,
      y: 0,
      width: 100,
      height: 10,
      textStyle: defaultTextStyle
    }
    const store = useDocumentStore.getState()
    store.loadDocument(document, null)
    let close!: (event: { preventDefault: () => void }) => void
    vi.mocked(getCurrentWindow).mockReturnValue({
      onCloseRequested: async (callback: typeof close) => {
        close = callback
        return () => {}
      }
    } as unknown as ReturnType<typeof getCurrentWindow>)
    let answer!: (allow: boolean) => void
    let finish!: () => void
    const confirmDiscard = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          answer = resolve
        })
    )
    const onCleanExit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    const cancelCleanExit = vi.fn()
    const dispose = installCloseGuard({
      hasUnsavedWork: () => useDocumentStore.getState().dirty,
      confirmDiscard,
      onCleanExit,
      cancelCleanExit,
      watchForChanges: watchDocumentChanges
    })
    try {
      await vi.waitFor(() => expect(close).toBeDefined())
      for (const change of ['measurement', 'typing', 'drag']) {
        vi.mocked(invoke).mockClear()
        onCleanExit.mockClear()
        cancelCleanExit.mockClear()
        if (phase === 'confirmation' || change !== 'measurement') {
          store.beginEdit()
          store.patchElements(['text'], { text: 'First input', x: 10 }, false)
        }
        const before = useDocumentStore.getState()
        close({ preventDefault: vi.fn() })
        if (phase === 'cleanup') {
          if (before.dirty) {
            answer(true)
          }
          await vi.advanceTimersByTimeAsync(0)
          expect(onCleanExit).toHaveBeenCalledTimes(1)
        }
        if (change === 'measurement') {
          store.syncTextHeight('text', 200)
          expect(useDocumentStore.getState().document).not.toBe(before.document)
        } else {
          store.patchElements(
            ['text'],
            change === 'typing' ? { text: 'Later input' } : { x: 20 },
            false
          )
        }
        expect(useDocumentStore.getState().dirty).toBe(before.dirty)
        expect(useDocumentStore.getState().past).toBe(before.past)
        expect(useDocumentStore.getState().future).toBe(before.future)
        if (phase === 'confirmation') {
          answer(true)
          await vi.advanceTimersByTimeAsync(0)
        }
        if (change === 'measurement' || phase === 'cleanup') {
          expect(onCleanExit).toHaveBeenCalledTimes(1)
          finish()
        }
        await vi.advanceTimersByTimeAsync(2000)
        if (change === 'measurement') {
          expect(invoke).toHaveBeenCalledExactlyOnceWith('quit_app')
          expect(cancelCleanExit).not.toHaveBeenCalled()
        } else {
          expect(invoke).not.toHaveBeenCalledWith('quit_app')
          expect(cancelCleanExit).toHaveBeenCalledTimes(phase === 'cleanup' ? 1 : 0)
          if (phase === 'confirmation') {
            expect(onCleanExit).not.toHaveBeenCalled()
          }
        }
      }
    } finally {
      dispose()
    }
  }
)
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})
it('never cleans browser records on pagehide, including without a beforeunload prompt', () => {
  vi.mocked(isTauriRuntime).mockReturnValue(false)
  const onCleanExit = vi.fn(async () => {})
  const dispose = installCloseGuard({
    hasUnsavedWork: () => true,
    confirmDiscard: async () => true,
    onCleanExit,
    cancelCleanExit: vi.fn(),
    watchForChanges: watchDocumentChanges
  })
  window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }))
  window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
  expect(onCleanExit).not.toHaveBeenCalled()
  dispose()
})
it('quits native after two seconds even if backend cleanup never resolves', async () => {
  vi.useFakeTimers()
  vi.mocked(isTauriRuntime).mockReturnValue(true)
  let close!: (event: { preventDefault: () => void }) => void
  vi.mocked(getCurrentWindow).mockReturnValue({
    onCloseRequested: async (callback: typeof close) => {
      close = callback
      return () => {}
    }
  } as unknown as ReturnType<typeof getCurrentWindow>)
  const onCleanExit = vi.fn(() => new Promise<void>(() => {}))
  const dispose = installCloseGuard({
    hasUnsavedWork: () => true,
    confirmDiscard: async () => true,
    onCleanExit,
    cancelCleanExit: vi.fn(),
    watchForChanges: watchDocumentChanges
  })
  await vi.waitFor(() => expect(close).toBeDefined())
  close({ preventDefault: vi.fn() })
  await vi.advanceTimersByTimeAsync(1999)
  expect(onCleanExit).toHaveBeenCalledTimes(1)
  expect(invoke).not.toHaveBeenCalledWith('quit_app')
  await vi.advanceTimersByTimeAsync(1)
  expect(invoke).toHaveBeenCalledWith('quit_app')
  dispose()
})

it.each(['edit', 'restore', 'edit then undo'])(
  'cancels native quit on %s during cleanup and permits a later close',
  async (change) => {
    vi.useFakeTimers()
    vi.mocked(isTauriRuntime).mockReturnValue(true)
    useDocumentStore.getState().newDocument()
    let close!: (event: { preventDefault: () => void }) => void
    vi.mocked(getCurrentWindow).mockReturnValue({
      onCloseRequested: async (callback: typeof close) => {
        close = callback
        return () => {}
      }
    } as unknown as ReturnType<typeof getCurrentWindow>)
    const onCleanExit = vi.fn(() => new Promise<void>(() => {}))
    const cancelCleanExit = vi.fn()
    const confirmDiscard = vi.fn(async () => false)
    const dispose = installCloseGuard({
      hasUnsavedWork: () => useDocumentStore.getState().dirty,
      confirmDiscard,
      onCleanExit,
      cancelCleanExit,
      watchForChanges: watchDocumentChanges
    })
    try {
      await vi.waitFor(() => expect(close).toBeDefined())
      close({ preventDefault: vi.fn() })
      await vi.advanceTimersByTimeAsync(100)
      const state = useDocumentStore.getState()
      if (change === 'restore') {
        state.restoreDocument({ ...state.document, name: 'Recovered' }, null)
      } else {
        state.renameDocument('New edit')
        if (change === 'edit then undo') {
          state.undo()
        }
      }
      await vi.advanceTimersByTimeAsync(2000)
      expect(invoke).not.toHaveBeenCalledWith('quit_app')
      expect(cancelCleanExit).toHaveBeenCalledTimes(1)
      expect(confirmDiscard).not.toHaveBeenCalled()
      confirmDiscard.mockResolvedValue(true)
      close({ preventDefault: vi.fn() })
      close({ preventDefault: vi.fn() })
      await vi.advanceTimersByTimeAsync(2000)
      expect(onCleanExit).toHaveBeenCalledTimes(2)
      expect(invoke).toHaveBeenCalledExactlyOnceWith('quit_app')
    } finally {
      dispose()
    }
  }
)

it('rejects a stale quit confirmation before starting destructive cleanup', async () => {
  vi.useFakeTimers()
  vi.mocked(isTauriRuntime).mockReturnValue(true)
  useDocumentStore.getState().newDocument()
  useDocumentStore.getState().renameDocument('Unsaved')
  let close!: (event: { preventDefault: () => void }) => void
  vi.mocked(getCurrentWindow).mockReturnValue({
    onCloseRequested: async (callback: typeof close) => {
      close = callback
      return () => {}
    }
  } as unknown as ReturnType<typeof getCurrentWindow>)
  let answer!: (allow: boolean) => void
  const onCleanExit = vi.fn(async () => {})
  const dispose = installCloseGuard({
    hasUnsavedWork: () => useDocumentStore.getState().dirty,
    confirmDiscard: () =>
      new Promise((resolve) => {
        answer = resolve
      }),
    onCleanExit,
    cancelCleanExit: vi.fn(),
    watchForChanges: watchDocumentChanges
  })
  try {
    await vi.waitFor(() => expect(close).toBeDefined())
    close({ preventDefault: vi.fn() })
    useDocumentStore.getState().renameDocument('Newer edits')
    answer(true)
    await vi.advanceTimersByTimeAsync(2000)
    expect(onCleanExit).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalledWith('quit_app')
  } finally {
    dispose()
  }
})
